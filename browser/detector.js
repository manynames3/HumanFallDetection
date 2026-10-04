import {LSTM} from './lstm.js';
import {features} from './features.js';

// Tracking adapted from match_ip; per-person classifier state instead of
// upstream's first-track-only prediction. No cross-camera identity matching.
export class Detector {
  constructor(manifest, buffer) { this.manifest=manifest;this.buffer=buffer;this.reset(); }
  reset() { this.tracks=[];this.nextId=1;this.lastTime=null; }
  update(poses, time) {
    if (this.lastTime !== null && (time-this.lastTime>1 || time<=this.lastTime)) this.reset();
    this.lastTime=time;
    this.tracks=this.tracks.filter(t=>time-t.last.time<.85);
    const assigned=new Set(), result=[];
    for (const pose of poses) {
      let candidate=null, distance=.35;
      for (const track of this.tracks) {
        if (assigned.has(track)) continue;
        const p=track.last;
        const d=Math.hypot(p.N[0]-pose.N[0],p.N[1]-pose.N[1],p.B[0]-pose.B[0],p.B[1]-pose.B[1]);
        if (d<distance) {distance=d;candidate=track;}
      }
      // Relax matching only for a single person with overlapping image boxes:
      // a collapse can move hips beyond the normal nearest-pose radius.
      if(!candidate&&poses.length===1&&this.tracks.length===1){
        const track=this.tracks[0],p=track.last,a=p.trackingBox??p.box,b=pose.trackingBox??pose.box;
        const overlaps=Math.min(a[2],b[2])>Math.max(a[0],b[0])&&Math.min(a[3],b[3])>Math.max(a[1],b[1]);
        const d=Math.hypot(p.N[0]-pose.N[0],p.N[1]-pose.N[1],p.B[0]-pose.B[0],p.B[1]-pose.B[1]);
        if(overlaps&&d<.75)candidate=track;
      }
      if (!candidate) {
        candidate={id:this.nextId++,model:new LSTM(this.manifest,this.buffer),history:[],samples:0,height:0,heightSamples:0,fallFrames:0};
        this.tracks.push(candidate);
      }
      assigned.add(candidate);
      const dt=candidate.last ? time-candidate.last.time : 0;
      if (dt>.3) { candidate.model.reset();candidate.history=[];candidate.samples=0;candidate.fallFrames=0;candidate.height=0;candidate.heightSamples=0; }
      try {
        if(pose.classifierReady===false)throw new Error('Head landmarks unavailable');
        const feature=features(pose,candidate.history);
        const prediction=candidate.model.step(feature.values);
        candidate.samples++;
        // Original post-filter, including raw logit threshold (not a probability).
        let state='monitoring';
        let reason='Classifier did not predict a fall';
        if ([1,2,3,5].includes(prediction.prediction)) {
          candidate.fallFrames=Math.max(0,candidate.fallFrames-1);
          const height=pose.box[3]-pose.box[1];
          if (candidate.heightSamples<108) {
            candidate.heightSamples++;
            candidate.height=(candidate.height*(candidate.heightSamples-1)+height)/candidate.heightSamples;
          } else candidate.height=(1-1/109)*height+(1/109)*candidate.height;
        } else if (prediction.prediction===0) {
          if ((candidate.height!==0 && Math.abs(feature.theta)<Math.PI/4) || prediction.score<.4) {
            state='evaluating';reason=prediction.score<.4?'Fall raw score below 0.4':'Upstream body-angle filter blocked warning';
          }
          else {
            candidate.fallFrames++;
            state=candidate.fallFrames>=9 ? 'possible-fall' : 'evaluating';
            reason=`Fall evidence count ${candidate.fallFrames}/9`;
          }
        } else candidate.fallFrames=Math.max(0,candidate.fallFrames-1);
        if (candidate.samples<36) {state='warming-up';reason=`Movement history ${candidate.samples}/36 observations`;}
        candidate.history.push(pose);candidate.history=candidate.history.slice(-2);
        candidate.last=pose;
        result.push({id:candidate.id,state,box:pose.box,landmarks:pose.landmarks,
          theta:feature.theta,rawClass:prediction.prediction,rawScore:prediction.score,samples:candidate.samples,reason});
      } catch {
        candidate.model.reset();candidate.history=[];candidate.samples=0;candidate.fallFrames=0;candidate.last=pose;
        result.push({id:candidate.id,state:'unavailable',box:pose.box,landmarks:pose.landmarks,samples:0,reason:pose.classifierReady===false?'Head unclear: classifier paused, body-posture check remains active':'Invalid pose geometry; history reset'});
      }
    }
    return result;
  }
}

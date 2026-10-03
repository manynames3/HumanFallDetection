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
    this.tracks=this.tracks.filter(t=>time-t.last.time<.6);
    const assigned=new Set(), result=[];
    for (const pose of poses) {
      let candidate=null, distance=.35;
      for (const track of this.tracks) {
        if (assigned.has(track)) continue;
        const p=track.last;
        const d=Math.hypot(p.N[0]-pose.N[0],p.N[1]-pose.N[1],p.B[0]-pose.B[0],p.B[1]-pose.B[1]);
        if (d<distance) {distance=d;candidate=track;}
      }
      if (!candidate) {
        candidate={id:this.nextId++,model:new LSTM(this.manifest,this.buffer),history:[],samples:0,height:0,heightSamples:0,fallFrames:0};
        this.tracks.push(candidate);
      }
      assigned.add(candidate);
      const dt=candidate.last ? time-candidate.last.time : 0;
      if (dt>.3) { candidate.model.reset();candidate.history=[];candidate.samples=0;candidate.fallFrames=0;candidate.height=0;candidate.heightSamples=0; }
      try {
        const feature=features(pose,candidate.history);
        const prediction=candidate.model.step(feature.values);
        candidate.samples++;
        // Original post-filter, including raw logit threshold (not a probability).
        let state='monitoring';
        if ([1,2,3,5].includes(prediction.prediction)) {
          candidate.fallFrames=Math.max(0,candidate.fallFrames-1);
          const height=pose.box[3]-pose.box[1];
          if (candidate.heightSamples<108) {
            candidate.heightSamples++;
            candidate.height=(candidate.height*(candidate.heightSamples-1)+height)/candidate.heightSamples;
          } else candidate.height=(1-1/109)*height+(1/109)*candidate.height;
        } else if (prediction.prediction===0) {
          if ((candidate.height!==0 && Math.abs(feature.theta)<Math.PI/4) || prediction.score<.4) state='evaluating';
          else {
            candidate.fallFrames++;
            state=candidate.fallFrames>=9 ? 'possible-fall' : 'evaluating';
          }
        } else candidate.fallFrames=Math.max(0,candidate.fallFrames-1);
        if (candidate.samples<36) state='warming-up';
        candidate.history.push(pose);candidate.history=candidate.history.slice(-2);
        candidate.last=pose;
        result.push({id:candidate.id,state,box:pose.box,landmarks:pose.landmarks,
          theta:feature.theta,rawClass:prediction.prediction,rawScore:prediction.score,samples:candidate.samples});
      } catch {
        candidate.model.reset();candidate.history=[];candidate.samples=0;candidate.fallFrames=0;candidate.last=pose;
        result.push({id:candidate.id,state:'unavailable',box:pose.box,landmarks:pose.landmarks,samples:0});
      }
    }
    return result;
  }
}

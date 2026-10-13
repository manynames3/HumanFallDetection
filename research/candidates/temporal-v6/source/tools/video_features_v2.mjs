// Candidate-only articulated geometry; never estimates impact or physical floor contact.
import {poseFeatures,temporalFeatures,score} from './video_temporal_features.mjs';
export const FEATURE_VERSION_V2='articulated-past-only-v2';
const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&Math.min(p.visibility??0,p.presence??1)>=.5;
const clip=v=>Math.max(-4,Math.min(4,v));
const track=f=>f.landmarkTrackIds?.[0]??(f.people?.length===1?f.people[0].id:null);
export function featuresV2(frames,index,width,height){
  const now=frames[index],current=poseFeatures(now,width,height);if(!current)return null;
  const identity=track(now),compatible=f=>identity===null||track(f)===identity;
  // Old traces and new traces use the same production track IDs where available.
  const safe=frames.slice(Math.max(0,index-40),index+1).map(f=>compatible(f)?f:{t:f.t,landmarks:[]});
  const vector=temporalFeatures(safe,safe.length-1,width,height),lm=now.landmarks[0];
  for(const [a,b,c] of [[23,25,27],[24,26,28],[11,13,15],[12,14,16]]){
    if(![a,b,c].every(i=>visible(lm[i]))){vector.push(0,0,0);continue;}
    const u=[(lm[a].x-lm[b].x)*width,(lm[a].y-lm[b].y)*height],v=[(lm[c].x-lm[b].x)*width,(lm[c].y-lm[b].y)*height];
    const den=Math.hypot(...u)*Math.hypot(...v);
    vector.push(den>1e-8?(u[0]*v[0]+u[1]*v[1])/den:0,Math.abs(v[0])/Math.max(1,Math.hypot(...v)),1);
  }
  const prior=[];
  for(let j=index-1;j>=0&&now.t-frames[j].t<=2;j--){
    if(!compatible(frames[j]))break;
    const p=poseFeatures(frames[j],width,height);if(p)prior.push({p,t:frames[j].t});
  }
  const upright=prior.filter(o=>o.p.values[1]<-.75);
  const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  if(upright.length>=4){
    const length=median(upright.map(o=>o.p.length)),hip=median(upright.map(o=>o.p.hip[1]));
    vector.push(clip((current.hip[1]-hip)/length),clip(current.length/length),clip(current.values[4]/median(upright.map(o=>o.p.values[4]))),1);
  }else vector.push(0,0,0,0);
  vector.push(prior.length/36,Math.min(1,upright.length/18));
  return vector;
}
export function v2Warnings(model,record){
  let since=null,last=null,identity=null;const times=[];
  for(let i=0;i<record.frames.length;i++){
    const f=record.frames[i],id=track(f),s=score(model,model.featureVersion===FEATURE_VERSION_V2?featuresV2(record.frames,i,record.width,record.height):temporalFeatures(record.frames,i,record.width,record.height));
    if(last!==null&&(f.t-last>.2||id!==identity))since=null;
    if(s!==null&&s>=model.threshold){since??=f.t;if(f.t-since+1e-8>=model.persistenceSeconds)times.push(f.t);}else since=null;
    last=f.t;identity=id;
  }
  return times;
}
export function evaluateV2(model,records){
  return records.map(record=>{
    const {clip}=record,times=v2Warnings(model,record),after=clip.fallStart===null?times:times.filter(t=>t>=clip.fallStart);
    return {...clip,warning:clip.label==='fall'?after.length>0:times.length>0,firstWarning:after[0]??null,latency:clip.label==='fall'&&clip.fallStart!==null&&after.length?after[0]-clip.fallStart:null,preEventWarningFrames:clip.fallStart===null?0:times.filter(t=>t<clip.fallStart).length};
  });
}
export function supervisedLabel(clip,t){
  if(clip.label==='adl')return 0;
  if(clip.annotationFrames?.length&&Number.isFinite(clip.sourceFps)){
    const index=Math.floor(t*clip.sourceFps)+1,a=clip.annotationFrames.find(f=>f.index===index);
    // Keep both label boundaries out of supervised fitting.
    if(!a||clip.annotationFrames.some(f=>Math.abs(f.index-index)<=Math.ceil(.15*clip.sourceFps)&&f.fall!==a.fall))return null;
    return Number(a.fall);
  }
  if(clip.fallStart===null)return null; // Weak labels do not become fabricated onset times.
  if(t>clip.fallStart-.3&&t<clip.fallStart+.15)return null;
  if(clip.fallEnd!==null&&t>clip.fallEnd)return null;
  return Number(t>=clip.fallStart+.15);
}

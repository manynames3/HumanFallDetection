// Offline candidate: causal native MediaPipe joints, explicit observation masks.
// No production imports. Missing observations never become invented landmarks/time.
import {PoseTracker} from '../browser/pose-tracker-v4.js';
import {score} from './video_temporal_features.mjs';
export const JOINTS=[0,11,12,13,14,15,16,23,24,25,26,27,28];
export const LAGS=[0,.25,.5,1];
const clamp=x=>Math.max(-4,Math.min(4,x));
const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.min(p.visibility??0,p.presence??1)>=.5;
export function jointObservation(lm,width,height){
  if(![11,12,23,24].every(i=>visible(lm[i])))return null;
  const hip=[(lm[23].x+lm[24].x)*width/2,(lm[23].y+lm[24].y)*height/2];
  const shoulder=[(lm[11].x+lm[12].x)*width/2,(lm[11].y+lm[12].y)*height/2];
  const scale=Math.hypot(hip[0]-shoulder[0],hip[1]-shoulder[1]);if(scale<height*.045)return null;
  const values=JOINTS.flatMap(i=>visible(lm[i])?[clamp((lm[i].x*width-hip[0])/scale),clamp((lm[i].y*height-hip[1])/scale),1]:[0,0,0]);
  return {hip,scale,values};
}
export function sequenceVector(history,t){
  const current=history.at(-1)?.observation;if(!current)return null;
  const x=[];
  for(const lag of LAGS){
    const old=history.findLast(f=>f.t<=t-lag+1e-6&&t-lag-f.t<.12)?.observation;
    x.push(...(old?.values??Array(JOINTS.length*3).fill(0)),Number(Boolean(old)));
    if(lag>0)x.push(old?clamp((current.hip[0]-old.hip[0])/old.scale):0,old?clamp((current.hip[1]-old.hip[1])/old.scale):0,old?clamp(current.scale/old.scale):0);
  }
  return x;
}
export function sequenceRows(record,{oracleSingleIdentity=false}={}){
  const tracker=new PoseTracker(),states=new Map(),rows=[];let last=null;
  for(const f of record.frames){
    if(last!==null&&(f.t<=last||f.t-last>1))states.clear();last=f.t;
    // Diagnostic oracle changes IDs only on unambiguous one-pose frames. Not production.
    const people=oracleSingleIdentity?(f.landmarks.length===1?[{id:1,landmarks:f.landmarks[0]}]:[]):tracker.update(f.landmarks,f.t,record.width,record.height);
    const observed=new Set(people.map(p=>p.id));for(const [id,s] of states){if(!observed.has(id))s.history.push({t:f.t,observation:null});if(f.t-s.seen>.5)states.delete(id);}
    rows.push({t:f.t,people:people.map(p=>{
      const s=states.get(p.id)??{history:[],seen:f.t},o=jointObservation(p.landmarks,record.width,record.height);
      s.history.push({t:f.t,observation:o});s.history=s.history.filter(h=>f.t-h.t<=1.2);s.seen=f.t;states.set(p.id,s);
      return {id:p.id,x:sequenceVector(s.history,f.t)};
    })});
  }
  return rows;
}
export function mirrorVector(x){
  const out=[...x];let start=0;const swap=[0,2,1,4,3,6,5,8,7,10,9,12,11];
  for(const lag of LAGS){
    for(let j=0;j<JOINTS.length;j++){out[start+j*3]=-x[start+swap[j]*3];out[start+j*3+1]=x[start+swap[j]*3+1];out[start+j*3+2]=x[start+swap[j]*3+2];}
    start+=JOINTS.length*3+1;if(lag>0){out[start]=-x[start];start+=3;}
  }
  return out;
}
export function sequenceWarnings(model,rows,policy){
  const states=new Map(),times=[];let last=null;
  for(const f of rows){
    if(last!==null&&(f.t<=last||f.t-last>.25))states.clear();const dt=last===null?0:f.t-last;last=f.t;
    const present=new Set(f.people.map(p=>p.id));for(const [id,s] of states)if(!present.has(id)){s.positive=false;if(f.t-s.seen>.5)states.delete(id);}
    for(const p of f.people){
      const s=states.get(p.id)??{evidence:[],positive:false,seen:f.t};
      const probability=Object.hasOwn(p,'prediction')?p.prediction:score(model,p.x);
      const positive=p.x!==null&&probability!==null&&probability>=model.threshold;
      s.evidence=s.evidence.filter(e=>f.t-e.t<=policy.windowSeconds);
      if(positive&&s.positive&&dt>0&&dt<=.2)s.evidence.push({t:f.t,dt});
      if(positive&&s.evidence.reduce((a,e)=>a+e.dt,0)+1e-8>=policy.evidenceSeconds)times.push(f.t);
      s.positive=positive;s.seen=f.t;states.set(p.id,s);
    }
  }
  return [...new Set(times)];
}

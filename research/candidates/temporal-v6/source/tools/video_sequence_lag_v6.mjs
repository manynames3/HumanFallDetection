// Separate bounded lag ablation; preserves the original cropped experiment's bytes.
import {PoseTrackerV6} from '../browser/pose-tracker-v6.js';
import {jointObservation,sequenceVector,LAGS,JOINTS} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
const clamp=x=>Math.max(-4,Math.min(4,x));
export function observedLagVector(history,t,hz){
  const current=history.at(-1)?.observation;if(!current||history.at(-1).t!==t)return null;
  const x=[],tolerance=Math.min(.12,1/hz+1e-8);
  for(const lag of LAGS){
    const old=history.findLast(f=>f.observation&&f.t<=t-lag+1e-6&&t-lag-f.t<tolerance)?.observation;
    x.push(...(old?.values??Array(JOINTS.length*3).fill(0)),Number(Boolean(old)));
    if(lag>0)x.push(old?clamp((current.hip[0]-old.hip[0])/old.scale):0,old?clamp((current.hip[1]-old.hip[1])/old.scale):0,old?clamp(current.scale/old.scale):0);
  }
  return x;
}
export function sequenceRowsLagV6(record,{mode='anchored',repairLag=true}={}){
  const tracker=new PoseTrackerV6({mode}),states=new Map(),rows=[];let last=null;
  for(const f of record.frames){
    if(last!==null&&(f.t<=last||f.t-last>1))states.clear();last=f.t;
    const people=tracker.update(f.landmarks,f.t,record.width,record.height),present=new Set(people.map(p=>p.id));
    for(const [id,s]of states){if(!present.has(id))s.history.push({t:f.t,observation:null});if(f.t-s.seen>.5)states.delete(id);}
    rows.push({t:f.t,people:people.map(p=>{
      const s=states.get(p.id)??{history:[],seen:f.t};s.history.push({t:f.t,observation:jointObservation(p.landmarks,record.width,record.height)});
      s.history=s.history.filter(h=>f.t-h.t<=1.2);s.seen=f.t;states.set(p.id,s);
      return {id:p.id,x:repairLag?observedLagVector(s.history,f.t,record.clip.samplingHz??18):sequenceVector(s.history,f.t),cropped:p.cropped};
    })});
  }
  return rows;
}

// Frozen weights/policy; only the observation admission/continuity experiment changes.
import {PoseTrackerV6} from '../browser/pose-tracker-v6.js';
import {jointObservation,sequenceVector} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
export function sequenceRowsV6(record,{mode='anchored',historyOnly=false}={}){
  const tracker=new PoseTrackerV6({mode}),states=new Map(),rows=[];let last=null;
  for(const f of record.frames){
    if(last!==null&&(f.t<=last||f.t-last>1))states.clear();last=f.t;
    const people=tracker.update(f.landmarks,f.t,record.width,record.height),present=new Set(people.map(p=>p.id));
    for(const [id,s] of states){if(!present.has(id))s.history.push({t:f.t,observation:null});if(f.t-s.seen>.5)states.delete(id);}
    rows.push({t:f.t,people:people.map(p=>{
      const s=states.get(p.id)??{history:[],seen:f.t};
      s.history.push({t:f.t,observation:jointObservation(p.landmarks,record.width,record.height)});
      s.history=s.history.filter(h=>f.t-h.t<=1.2);s.seen=f.t;states.set(p.id,s);
      return {id:p.id,x:historyOnly&&p.cropped?null:sequenceVector(s.history,f.t),cropped:p.cropped};
    })});
  }
  return rows;
}

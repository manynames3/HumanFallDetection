// Research warning guard. Uses the existing articulated upright-stance definition.
import {PoseTrackerV6} from '../browser/pose-tracker-v6.js';
import {bodyObservation} from './video_policy_v4.mjs';
import {tcnRows,tcnScore,TCN_DIM} from './video_tcn_v6.mjs';
export function guardedTCNRows(model,record,{removeDepth=false}={}){
  const tracker=new PoseTrackerV6({mode:'anchored'}),rows=tcnRows(record);
  return rows.map((row,i)=>{
    const people=tracker.update(record.frames[i].landmarks,row.t,record.width,record.height);
    return {...row,people:row.people.map(p=>{
      const x=p.x?[...p.x]:null;
      if(x&&removeDepth)for(let t=0;t<x.length;t+=TCN_DIM){for(let j=0;j<13;j++)x[t+j*4+2]=0;x[t+55]=0;}
      const observed=people.find(q=>q.id===p.id),body=observed?bodyObservation(observed.rawLandmarks,record.width,record.height):null;
      const uprightAffirmed=Boolean(body?.upright&&body.legs===2);
      const rawPrediction=tcnScore(model,x);
      return {...p,x,rawPrediction,uprightAffirmed,prediction:uprightAffirmed?0:rawPrediction};
    })};
  });
}

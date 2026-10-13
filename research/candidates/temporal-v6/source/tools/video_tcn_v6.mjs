// Local research model: causal observed pose windows with estimated depth and masks.
import {PoseTrackerV6} from '../browser/pose-tracker-v6.js';
import {JOINTS} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
export const TCN_STEPS=18,TCN_DIM=56;
const clip=x=>Math.max(-4,Math.min(4,x));
const confidence=p=>Math.min(p?.visibility??0,p?.presence??1);
const visible=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&confidence(p)>=.5;
function observe(lm,width,height){
  if(![11,12,23,24].every(i=>lm[i]&&[lm[i].x,lm[i].y,lm[i].z].every(Number.isFinite)&&confidence(lm[i])>=.5))return null;
  const mid=(a,b)=>[(lm[a].x+lm[b].x)*width/2,(lm[a].y+lm[b].y)*height/2,(lm[a].z+lm[b].z)*width/2];
  const hip=mid(23,24),shoulder=mid(11,12),scale=Math.hypot(...hip.map((v,i)=>v-shoulder[i]));
  if(!(scale>height*.045))return null;
  const values=JOINTS.flatMap(i=>visible(lm[i])?[clip((lm[i].x*width-hip[0])/scale),clip((lm[i].y*height-hip[1])/scale),clip((lm[i].z*width-hip[2])/scale),1]:[0,0,0,0]);
  if(values.filter((v,i)=>i%4===3&&v===1).length<3)return null;
  return {hip,scale,values:[...values,1,0,0,0]};
}
export function tcnRows(record){
  const tracker=new PoseTrackerV6({mode:'anchored'}),states=new Map(),rows=[];let last=null;
  const hz=record.clip.samplingHz??18,tolerance=Math.min(.12,1/hz+1e-8);
  for(const f of record.frames){
    if(last!==null&&(f.t<=last||f.t-last>1))states.clear();last=f.t;
    const people=tracker.update(f.landmarks,f.t,record.width,record.height),present=new Set(people.map(p=>p.id));
    for(const [id,s]of states){if(!present.has(id))s.history.push({t:f.t,observation:null});if(f.t-s.seen>.5)states.delete(id);}
    rows.push({t:f.t,people:people.map(p=>{
      const s=states.get(p.id)??{history:[],seen:f.t},o=observe(p.rawLandmarks,record.width,record.height);
      const prior=s.history.findLast(h=>h.observation&&h.t<=f.t-.25+1e-6&&f.t-.25-h.t<tolerance)?.observation;
      if(o&&prior)for(let i=0;i<3;i++)o.values[53+i]=clip((o.hip[i]-prior.hip[i])/prior.scale);
      s.history.push({t:f.t,observation:o});s.history=s.history.filter(h=>f.t-h.t<=3);s.seen=f.t;states.set(p.id,s);
      if(!o)return {id:p.id,x:null};
      const x=[];
      for(let k=TCN_STEPS-1;k>=0;k--){
        const target=f.t-k/6,h=s.history.findLast(h=>h.t<=target+1e-6&&target-h.t<tolerance);
        x.push(...(h?.observation?.values??Array(TCN_DIM).fill(0)));
      }
      return {id:p.id,x};
    })});
  }
  return rows;
}
export function mirrorTCN(x){
  const y=[...x],swap=[0,2,1,4,3,6,5,8,7,10,9,12,11];
  for(let t=0;t<TCN_STEPS;t++){
    const start=t*TCN_DIM;
    for(let j=0;j<JOINTS.length;j++)for(let k=0;k<4;k++)y[start+j*4+k]=(k===0?-1:1)*x[start+swap[j]*4+k];
    y[start+53]=-x[start+53];
  }
  return y;
}
export function tcnScore(model,x){
  if(!x)return null;
  if(x.length!==model.steps*model.dim)throw new Error('TCN feature dimension mismatch');
  const {dim,hidden,kernel}=model,normalized=Array(x.length);
  for(let t=0;t<model.steps;t++)for(let d=0;d<dim;d++){
    const i=t*dim+d,mask=d<52?x[t*dim+Math.floor(d/4)*4+3]:x[t*dim+52];
    normalized[i]=d<52&&d%4===3||d===52?x[i]:mask?Math.max(-6,Math.min(6,(x[i]-model.mean[d])/model.scale[d])):0;
  }
  const inputs=[];
  for(let k=0;k<kernel;k++){
    const t=model.steps-1-k*model.dilation,h=Array(hidden).fill(0);
    for(let j=0;j<hidden;j++){
      let z=model.b1[j];
      for(let q=0;q<kernel;q++)if(t-q>=0)for(let d=0;d<dim;d++)z+=normalized[(t-q)*dim+d]*model.w1[(q*dim+d)*hidden+j];
      h[j]=Math.tanh(z);
    }
    inputs.push(h);
  }
  let output=model.bo;
  for(let j=0;j<hidden;j++){
    let z=model.b2[j];for(let k=0;k<kernel;k++)for(let d=0;d<hidden;d++)z+=inputs[k][d]*model.w2[(k*hidden+d)*hidden+j];
    output+=Math.tanh(z)*model.wo[j];
  }
  return 1/(1+Math.exp(-Math.max(-30,Math.min(30,output))));
}

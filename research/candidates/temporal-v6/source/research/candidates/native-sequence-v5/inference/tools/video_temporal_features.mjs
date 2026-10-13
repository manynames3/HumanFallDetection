// Offline research candidate. Not used by the production app.
const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&Math.min(p.visibility??0,p.presence??1)>=.5;
const point=(lm,a,b,w,h)=>[(lm[a].x+lm[b].x)*w/2,(lm[a].y+lm[b].y)*h/2];
export const FEATURE_VERSION='torso-relative-temporal-v1';
export function poseFeatures(frame,width,height){
  // This initial candidate is explicitly single-person. Never stitch different bodies.
  if(frame.landmarks?.length!==1)return null;
  const lm=frame.landmarks[0];
  if(![11,12,23,24].every(i=>visible(lm[i])))return null;
  const s=point(lm,11,12,width,height),hip=point(lm,23,24,width,height),length=Math.hypot(s[0]-hip[0],s[1]-hip[1]);
  if(length<height*.045)return null;
  const body=lm.filter(visible),xs=body.map(p=>p.x*width),ys=body.map(p=>p.y*height);
  const values=[Math.abs(s[0]-hip[0])/length,(s[1]-hip[1])/length,length/height,(Math.max(...xs)-Math.min(...xs))/length,(Math.max(...ys)-Math.min(...ys))/length];
  for(const [a,b] of [[13,14],[15,16],[25,26],[27,28]]){
    const valid=[a,b].filter(i=>visible(lm[i]));
    if(!valid.length){values.push(0,0,0);continue;}
    const x=valid.reduce((sum,i)=>sum+lm[i].x*width,0)/valid.length,y=valid.reduce((sum,i)=>sum+lm[i].y*height,0)/valid.length;
    values.push(Math.min(4,Math.abs(x-hip[0])/length),Math.max(-4,Math.min(4,(y-hip[1])/length)),valid.length/2);
  }
  return {values,hip,length};
}
export function temporalFeatures(frames,index,width,height){
  const now=frames[index],current=poseFeatures(now,width,height);if(!current)return null;
  const vector=[];
  for(const lag of [0,.25,.5,1]){
    let j=index;while(j>=0&&frames[j].t>now.t-lag+1e-6)j--;
    const old=j>=0&&now.t-lag-frames[j].t<.12?poseFeatures(frames[j],width,height):null;
    vector.push(...(old?.values??Array(17).fill(0)),old?1:0);
    if(lag>0)vector.push(old?Math.max(-4,Math.min(4,(current.hip[1]-old.hip[1])/old.length)):0);
  }
  return vector;
}
export function score(model,vector){
  if(!vector)return null;
  if(vector.length!==model.mean.length)throw new Error('Feature dimension mismatch');
  const x=vector.map((v,i)=>Math.max(-6,Math.min(6,(v-model.mean[i])/model.scale[i])));
  let value=model.b2;
  for(let j=0;j<model.hidden;j++){
    let a=model.b1[j];for(let i=0;i<x.length;i++)a+=model.w1[j*x.length+i]*x[i];
    value+=Math.tanh(a)*model.w2[j];
  }
  return 1/(1+Math.exp(-Math.max(-30,Math.min(30,value))));
}
export function candidateWarnings(model,record){
  let since=null,last=null;const warnings=[];
  for(let i=0;i<record.frames.length;i++){
    const frame=record.frames[i],s=score(model,temporalFeatures(record.frames,i,record.width,record.height));
    if(last!==null&&frame.t-last>.2)since=null;
    if(s!==null&&s>=model.threshold){since??=frame.t;if(frame.t-since+1e-8>=model.persistenceSeconds)warnings.push(frame.t);}
    else since=null;
    last=frame.t;
  }
  return warnings;
}
export function evaluateCandidate(model,records){
  return records.map(record=>{
    const {clip}=record,times=candidateWarnings(model,record),after=clip.fallStart===null?times:times.filter(t=>t>=clip.fallStart);
    return {...clip,warning:clip.label==='fall'?after.length>0:times.length>0,firstWarning:after[0]??null,latency:clip.label==='fall'&&clip.fallStart!==null&&after.length?after[0]-clip.fallStart:null,preEventWarningFrames:clip.fallStart===null?0:times.filter(t=>t<clip.fallStart).length};
  });
}
export function eventMetrics(rows){
  const falls=rows.filter(r=>r.label==='fall'),adl=rows.filter(r=>r.label==='adl');
  const tp=falls.filter(r=>r.warning).length,fp=adl.filter(r=>r.warning).length;
  return {fallClips:falls.length,detectedFallClips:tp,ordinaryClips:adl.length,falseWarningClips:fp,recall:falls.length?tp/falls.length:null,precision:tp+fp?tp/(tp+fp):0,f1:2*tp+fp+falls.length-tp?2*tp/(2*tp+fp+falls.length-tp):0,adlSeconds:adl.reduce((sum,r)=>sum+r.duration,0)};
}

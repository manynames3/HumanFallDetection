// Local candidate policy only; not imported by the live app.
import {PoseTracker} from '../browser/pose-tracker-v4.js';
import {temporalFeatures,score} from './video_temporal_features.mjs';
export const DEFAULT_POLICY={windowSeconds:.9,evidenceSeconds:.15,eventSeconds:3};
const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>.025&&p.x<.975&&p.y>.025&&p.y<.975&&Math.min(p.visibility??0,p.presence??1)>=.5;
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
export function bodyObservation(lm,width,height){
  if(![11,12,23,24].every(i=>visible(lm[i])))return null;
  const mid=(a,b)=>[(lm[a].x+lm[b].x)*width/2,(lm[a].y+lm[b].y)*height/2],s=mid(11,12),hip=mid(23,24),length=Math.hypot(s[0]-hip[0],s[1]-hip[1]);
  if(length<height*.045)return null;
  const legs=[[23,25,27],[24,26,28]].filter(chain=>chain.every(i=>visible(lm[i])));
  const body=[s,hip,...[25,26,27,28].filter(i=>visible(lm[i])).map(i=>[lm[i].x*width,lm[i].y*height])],ys=body.map(p=>p[1]);
  const angle=Math.atan2(Math.abs(s[0]-hip[0]),Math.abs(s[1]-hip[1]))*180/Math.PI;
  const feet=legs.map(chain=>lm[chain[2]].y*height);
  return {hipY:hip[1],hipX:hip[0],length,angle,height:Math.max(...ys)-Math.min(...ys),footY:feet.length?Math.max(...feet):null,legs:legs.length,lowerPoints:[25,26,27,28].filter(i=>visible(lm[i])).length,coreUpright:angle<40,stance:feet.length>0&&Math.max(...feet)-hip[1]>.5*length,upright:angle<40&&feet.length>0&&Math.max(...feet)-hip[1]>.5*length};
}
export function observationsV3(model,record){
  const tracker=new PoseTracker(),states=new Map(),rows=[];let priorTime=null;
  for(const f of record.frames){
    if(priorTime!==null&&(f.t<=priorTime||f.t-priorTime>1))states.clear();priorTime=f.t;
    const people=tracker.update(f.landmarks,f.t,record.width,record.height),present=new Set(people.map(p=>p.id));
    for(const [id,s] of states){
      if(!present.has(id)){s.frames.push({t:f.t,landmarks:[]});s.previousObserved=false;}
      if(f.t-s.lastSeen>.5)states.delete(id);
    }
    const current=[];
    for(const p of people){
      const s=states.get(p.id)??{frames:[],lastSeen:f.t,previousObserved:false};
      s.frames.push({t:f.t,landmarks:[p.landmarks]});s.frames=s.frames.filter(frame=>f.t-frame.t<=1.3);
      const vector=temporalFeatures(s.frames,s.frames.length-1,record.width,record.height),value=score(model,vector),body=bodyObservation(p.rawLandmarks,record.width,record.height);
      current.push({id:p.id,t:f.t,score:value,vector,body,previousObserved:s.previousObserved});
      s.previousObserved=body!==null;s.lastSeen=f.t;states.set(p.id,s);
    }
    rows.push({t:f.t,people:current});
  }
  return rows;
}
export function applyPolicy(model,rows,policy=DEFAULT_POLICY){
  if(![policy.windowSeconds,policy.evidenceSeconds,policy.eventSeconds].every(v=>Number.isFinite(v)&&v>0)||policy.windowSeconds>3||policy.eventSeconds>5)throw new Error('Invalid observed-evidence policy');
  const states=new Map(),warnings=[],diagnostics=[];let lastTime=null;
  for(const row of rows){
    if(lastTime!==null&&(row.t<=lastTime||row.t-lastTime>1))states.clear();
    const dt=lastTime===null?0:row.t-lastTime;lastTime=row.t;
    const seen=new Set(row.people.map(p=>p.id));for(const [id,s] of states)if(!seen.has(id))s.previousObserved=false;
    for(const p of row.people){
      const s=states.get(p.id)??{refs:[],positive:[],eventAt:null,recline:false,motionReference:null,recoveryAt:null,previousObserved:false,lastSeen:row.t};
      const b=p.body;s.refs=s.refs.filter(r=>row.t-r.t<=3);s.positive=s.positive.filter(v=>row.t-v.t<=policy.windowSeconds);
      if(s.eventAt!==null&&row.t-s.eventAt>policy.eventSeconds){s.eventAt=null;s.positive=[];}
      let reference=null,floorCompatible=false;
      if(s.motionReference||s.refs.length>=2){
        const m=key=>median(s.refs.map(r=>r[key])),feet=s.refs.map(r=>r.footY).filter(Number.isFinite);
        reference=s.motionReference??{hipY:m('hipY'),footY:feet.length>=2?median(feet):null,length:m('length'),height:m('height'),angle:m('angle')};
        floorCompatible=b!==null&&(reference.footY===null||b.hipY>=reference.footY-.6*reference.length);
      }
      // A supported recline without downward displacement is not a fall transition.
      if(b&&reference&&b.angle>=55&&b.hipY-reference.hipY<.35*reference.length&&s.eventAt===null){s.recline=true;s.motionReference??=reference;}
      if(b&&reference&&b.hipY-reference.hipY>.4*reference.length&&(b.angle-reference.angle>25||b.legs>0&&b.height<reference.height*.75)){
        if(!s.recline||reference.footY!==null&&floorCompatible&&b.hipY-reference.hipY>.6*reference.length){s.eventAt??=row.t;s.recline=false;s.motionReference??=reference;}
      }
      const recovering=b&&((b.coreUpright??b.upright)||b.stance)&&(!reference||(reference.footY===null?b.hipY<reference.hipY+.2*reference.length:b.hipY<reference.footY-.8*reference.length));
      if(recovering){
        s.recoveryAt??=row.t;
        if(!s.recline&&s.eventAt===null||row.t-s.recoveryAt>.5){s.eventAt=null;s.recline=false;s.motionReference=null;s.positive=[];s.refs.push({...b,t:row.t});}
      }else s.recoveryAt=null;
      const downShape=b&&b.angle>=55&&(b.lowerPoints??b.legs)>0;
      const supported=Boolean(reference&&!s.recline&&(s.eventAt!==null||floorCompatible&&downShape));
      if(b&&supported&&p.score!==null&&p.score>=model.threshold&&s.previousObserved&&dt>0&&dt<=.2)s.positive.push({t:row.t,weight:dt});
      const evidence=s.positive.reduce((sum,v)=>sum+v.weight,0),warn=Boolean(b&&supported&&evidence+1e-8>=policy.evidenceSeconds);
      if(warn)warnings.push(row.t);
      diagnostics.push({t:row.t,id:p.id,score:p.score,warning:warn,observed:b!==null,referenceAvailable:reference!==null,supportLineKnown:reference?.footY!==null&&reference!==null,floorCompatible,controlledRecline:s.recline,eventAt:s.eventAt,evidenceSeconds:evidence});
      s.previousObserved=b!==null;s.lastSeen=row.t;states.set(p.id,s);
    }
    for(const [id,s] of states)if(row.t-s.lastSeen>.5)states.delete(id);
  }
  return {times:[...new Set(warnings)],diagnostics};
}
export function warningsV3(model,record,policy=DEFAULT_POLICY){return applyPolicy(model,observationsV3(model,record),policy).times;}
export function evaluateV3(model,records,policy=DEFAULT_POLICY){
  return records.map(record=>{
    const times=warningsV3(model,record,policy),c=record.clip,after=c.fallStart===null?times:times.filter(t=>t>=c.fallStart);
    return {...c,warning:c.label==='fall'?after.length>0:times.length>0,firstWarning:after[0]??null,preEventWarningFrames:c.fallStart===null?0:times.filter(t=>t<c.fallStart).length};
  });
}

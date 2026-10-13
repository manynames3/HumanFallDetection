// Offline inspection of frozen inference. This module is never imported by the app.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile, link, unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {digest} from './video_checkpoint.mjs';
import {sequenceRows, sequenceWarnings} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
import {score} from '../research/candidates/native-sequence-v5/inference/tools/video_temporal_features.mjs';
import {continuousMetrics, alertEpisodes} from './video_event_metrics.mjs';

export const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const DATA=path.join(ROOT,'tests/fixtures/generated/video-benchmark');
export const ARCHIVE=path.join(ROOT,'research/candidates/native-sequence-v5');
export const OUTPUT=path.join(DATA,'cycle6-diagnostics');
export const json=async file=>JSON.parse(await readFile(file,'utf8'));
export const coreJoints=[11,12,23,24];

export async function publishJSON(file,value){
  const bytes=JSON.stringify(value,null,2)+'\n';
  await mkdir(path.dirname(file),{recursive:true});
  const temp=file+'.'+randomUUID()+'.partial';
  try{
    await writeFile(temp,bytes,{flag:'wx'});
    try{await link(temp,file);}catch(error){
      if(error.code!=='EEXIST')throw error;
      if(await readFile(file,'utf8')!==bytes)throw new Error(`Changed output; preserve it and use a new directory: ${file}`);
    }
  }finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}

export async function frozenInputs(){
  const artifacts=await json(path.join(ARCHIVE,'artifacts.json'));
  for(const [name,expected] of Object.entries(artifacts.files)){
    const bytes=await readFile(path.join(ARCHIVE,name));
    if(bytes.length!==expected.bytes||digest(bytes)!==expected.sha256)throw new Error(`Frozen archive changed: ${name}`);
  }
  return {model:await json(path.join(ARCHIVE,'cycle5-weak/model.json')),
    selection:await json(path.join(ARCHIVE,'cycle5-weak/selection.json')),
    evaluation:await json(path.join(ARCHIVE,'continuous-evaluation.json')),
    manifest:await json(path.join(ARCHIVE,'continuous-manifest.json')),
    artifactsSha256:digest(await readFile(path.join(ARCHIVE,'artifacts.json')))};
}

export function validateTrace(saved,id){
  const {_checkpoint,...record}=saved;
  if(_checkpoint){
    if(_checkpoint.version!==1||digest(_checkpoint.contract)!==_checkpoint.contractSha256)throw new Error(`Trace contract mismatch: ${id}`);
    if(digest(record)!==_checkpoint.recordSha256)throw new Error(`Trace integrity mismatch: ${id}`);
  }
  if(record.clip?.id!==id||!(record.width>0&&record.height>0)||!record.frames?.length||record.frames.length!==record.clip.frames)throw new Error(`Incomplete trace: ${id}`);
  const hz=record.clip.samplingHz??18;
  if(![6,18].includes(hz))throw new Error(`Unsupported trace cadence: ${id}`);
  if(_checkpoint&&(_checkpoint.contract.expectedFrames!==record.frames.length||_checkpoint.contract.samplingHz!==hz))throw new Error(`Trace requested count/cadence mismatch: ${id}`);
  if(record.frames.some((f,i)=>!Number.isFinite(f.t)||Math.abs(f.t-i/hz)>1e-6||!Array.isArray(f.landmarks)||!Array.isArray(f.people)))throw new Error(`Invalid continuous trace clock/schema: ${id}`);
  return {record,checkpointVerified:Boolean(_checkpoint),runtimeAssetsVerified:Boolean(_checkpoint?.contract.runtimeAssets)};
}

export function validateIntervals(intervals,duration){
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Invalid recording duration');
  let end=-1;
  for(const interval of intervals){
    const [a,b]=interval;
    if(interval.length!==2||![a,b].every(Number.isFinite)||a<0||b<=a||b>duration+1e-6)throw new Error('Invalid normal interval');
    if(a<end)throw new Error('Normal intervals overlap or are unsorted');
    end=b;
  }
}

export function explainPose(lm,width,height){
  const reasons=[];
  if(!coreJoints.every(i=>lm[i]&&Number.isFinite(lm[i].x)&&Number.isFinite(lm[i].y)))reasons.push('core-missing');
  else{
    if(coreJoints.some(i=>Math.min(lm[i].visibility??0,lm[i].presence??1)<.5))reasons.push('core-confidence');
    if(coreJoints.some(i=>lm[i].x<0||lm[i].x>1||lm[i].y<0||lm[i].y>1))reasons.push('core-out-of-frame');
    const dx=(lm[11].x+lm[12].x-lm[23].x-lm[24].x)*width/2;
    const dy=(lm[11].y+lm[12].y-lm[23].y-lm[24].y)*height/2;
    if(Math.hypot(dx,dy)<height*.045)reasons.push('short-torso');
  }
  return {reasons,core:coreJoints.map(i=>({joint:i,confidence:Math.min(lm[i]?.visibility??0,lm[i]?.presence??1)}))};
}

// Instrumentation mirrors the archived policy; every use asserts warning-time parity.
export function tracePolicy(model,rows,policy){
  const states=new Map(),frames=[];let last=null;
  for(const f of rows){
    const reset=last!==null&&(f.t<=last||f.t-last>.25);
    if(reset)states.clear();
    const dt=last===null?0:f.t-last;last=f.t;
    const present=new Set(f.people.map(p=>p.id));
    for(const [id,s] of states)if(!present.has(id)){s.positive=false;if(f.t-s.seen>.5)states.delete(id);}
    const people=f.people.map(p=>{
      const fresh=!states.has(p.id),s=states.get(p.id)??{evidence:[],positive:false,seen:f.t};
      const probability=Object.hasOwn(p,'prediction')?p.prediction:score(model,p.x);
      const positive=p.x!==null&&probability!==null&&probability>=model.threshold;
      s.evidence=s.evidence.filter(e=>f.t-e.t<=policy.windowSeconds);
      if(positive&&s.positive&&dt>0&&dt<=.2)s.evidence.push({t:f.t,dt});
      const evidenceSeconds=s.evidence.reduce((a,e)=>a+e.dt,0);
      const warning=positive&&evidenceSeconds+1e-8>=policy.evidenceSeconds;
      s.positive=positive;s.seen=f.t;states.set(p.id,s);
      return {id:p.id,eligible:p.x!==null,score:probability,positive,evidenceSeconds,warning,fresh,
        reason:p.x===null?'no-eligible-observation':!positive?'below-threshold':warning?'warning':'insufficient-observed-evidence'};
    });
    frames.push({t:f.t,reset,people,warning:people.some(p=>p.warning)});
  }
  assert.deepEqual(frames.filter(f=>f.warning).map(f=>f.t),sequenceWarnings(model,rows,policy),'Diagnostic policy diverged from frozen inference');
  return frames;
}

export function phaseCoverage(frames,start,end){
  const samples=frames.filter(f=>f.t>=start&&f.t<end);
  const count=fn=>samples.filter(fn).length;
  const poseFrames=count(f=>f.rawBodies>0),eligibleFrames=count(f=>f.people.some(p=>p.eligible));
  let previous=null,consecutiveIdChanges=0;
  for(const f of samples){
    const ids=f.people.filter(p=>p.eligible).map(p=>p.id);
    const id=ids.length===1?ids[0]:null;
    if(id!==null&&previous!==null&&id!==previous)consecutiveIdChanges++;
    previous=id;
  }
  const scores=samples.flatMap(f=>f.people.filter(p=>p.score!==null).map(p=>p.score));
  const reasons={};for(const f of samples)for(const p of f.rawPoses??[])for(const r of p.reasons)reasons[r]=(reasons[r]??0)+1;
  return {start,end,sampledFrames:samples.length,poseFrames,eligibleFrames,
    poseCoverage:samples.length?poseFrames/samples.length:null,eligibleCoverage:samples.length?eligibleFrames/samples.length:null,
    positiveFrames:count(f=>f.people.some(p=>p.positive)),warningFrames:count(f=>f.warning),
    maxScore:scores.length?Math.max(...scores):null,consecutiveIdChanges,
    observedIds:[...new Set(samples.flatMap(f=>f.people.map(p=>p.id)))],rawPoseRejectionCounts:reasons};
}

export function diagnoseRecord(record,clip,model,policy){
  validateIntervals(clip.normalIntervals,clip.duration);
  if(clip.events.some(e=>!Number.isFinite(e.start)||!Number.isFinite(e.processEnd)||e.start<0||e.processEnd<e.start||e.processEnd>clip.duration))throw new Error('Invalid fall event');
  const rows=sequenceRows(record),frames=tracePolicy(model,rows,policy).map((f,i)=>({...f,
    rawBodies:record.frames[i].landmarks.length,rawPoses:record.frames[i].landmarks.map(lm=>explainPose(lm,record.width,record.height)),
    production:record.frames[i].people.map(p=>({id:p.id,state:p.state,reason:p.reason,warning:p.warning??null,rawClass:p.rawClass,rawScore:p.rawScore,downState:p.down?.state??null}))}));
  const warnings=frames.filter(f=>f.warning).map(f=>f.t),samplingHz=record.clip.samplingHz??18;
  const metrics=continuousMetrics(warnings,clip,{samplingHz});
  const events=metrics.detections.map(e=>{
    const scoring=phaseCoverage(frames,e.start,Math.min(clip.duration,e.processEnd+3)+1e-8);
    return {...e,scoring,stage:e.detected?'detected':!scoring.poseFrames?'noPose':!scoring.eligibleFrames?'noEligibleJoints':!scoring.positiveFrames?'neverAboveThreshold':!scoring.warningFrames?'insufficientObservedEvidence':'preexistingOrMergedWarning',
      phases:{before:phaseCoverage(frames,Math.max(0,e.start-3),e.start),during:phaseCoverage(frames,e.start,e.processEnd),after:phaseCoverage(frames,e.processEnd,Math.min(clip.duration,e.processEnd+3)+1e-8)}};
  });
  const normal=t=>clip.normalIntervals.some(([a,b])=>t>=a&&t<b);
  const falseEpisodes=alertEpisodes(warnings).filter(e=>e.times.some(normal)).map(e=>({start:e.start,end:e.end,firstNormalWarning:e.times.find(normal),lastNormalWarning:e.times.filter(normal).at(-1)}));
  const scoreWindows=[];
  for(const [a,b] of clip.normalIntervals)for(let t=a;t+5<=b+1e-8;t+=5)scoreWindows.push({kind:'normal',...phaseCoverage(frames,t,t+5)});
  for(const e of clip.events)if(e.start+5<=clip.duration)scoreWindows.push({kind:'fall-onset',eventId:e.id,...phaseCoverage(frames,e.start,e.start+5)});
  return {id:clip.id,subject:clip.subject,camera:clip.camera,duration:clip.duration,samplingHz,metrics,events,falseEpisodes,scoreWindows,
    graceSensitivity:[0,3,10,30].map(graceSeconds=>({graceSeconds,metrics:continuousMetrics(warnings,clip,{samplingHz,graceSeconds})})),
    notificationTelemetry:'not-recorded',frames};
}

export function summarize(reports){
  const events=reports.flatMap(r=>r.events.map(e=>({...e,recording:r.id,subject:r.subject,camera:r.camera})));
  const coverageBins=[[0,.5],[.5,.9],[.9,1.000001]].map(([min,max])=>{
    const rows=events.filter(e=>e.scoring.eligibleCoverage!==null&&e.scoring.eligibleCoverage>=min&&e.scoring.eligibleCoverage<max);
    return {min,max:Math.min(1,max),events:rows.length,detected:rows.filter(e=>e.detected).length,missed:rows.filter(e=>!e.detected).length};
  });
  return {designation:'Seen-data diagnostics; not a new holdout or a trained candidate',deploy:false,
    aggregate:reports.reduce((a,r)=>{for(const k of ['events','missed','falseEpisodes','normalSeconds','normalWarningSeconds'])a[k]=(a[k]??0)+r.metrics[k];return a;},{}),coverageBins,events,
    limitations:['Coverage is code eligibility, not independent anatomical or identity ground truth.',
      'Paired views and events within a participant are correlated.',
      'Consecutive output-ID changes are not annotated identity switches.',
      'Warning seconds are detector-state samples, not latched UI or delivered notifications.',
      'Longer grace windows and score windows are diagnostic only; labels and the primary metric are unchanged.',
      'Legacy traces did not separately hash WASM assets; new hashes cannot retroactively verify them.']};
}

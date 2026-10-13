import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DATA,ROOT,json,frozenInputs,validateTrace,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
import {tcnRows,tcnScore,TCN_DIM} from './video_tcn_v6.mjs';
import {sequenceWarnings,sequenceRows} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
import {continuousMetrics} from './video_event_metrics.mjs';
const out=path.join(DATA,'cycle6-tcn-no-depth'),recipe=await json(path.join(out,'recipe.json')),modelBytes=await readFile(path.join(out,'model.json')),model=JSON.parse(modelBytes),frozen=await frozenInputs();
for(const[f,h]of Object.entries(recipe.codeHashes))assert.equal(digest(await readFile(path.join(ROOT,f))),h);
const ref=await json(path.join(out,'reference.json'));
for(let i=0;i<ref.inputs.length;i++)assert.ok(Math.abs(tcnScore(model,ref.inputs[i].flat())-ref.predictions[i])<1e-6);
await publishJSON(path.join(out,'model-freeze.json'),{modelSha256:digest(modelBytes),recipeSha256:digest(await readFile(path.join(out,'recipe.json'))),
  evaluationSha256:digest(await readFile(new URL(import.meta.url))),policy:recipe.policy,threshold:model.threshold,codeHashes:recipe.codeHashes,deploy:false});
function rows(record){return tcnRows(record).map(f=>({...f,people:f.people.map(p=>{
  if(!p.x)return {...p,prediction:null};const x=[...p.x];
  for(let i=0;i<x.length;i+=TCN_DIM){for(let j=0;j<13;j++)x[i+j*4+2]=0;x[i+55]=0;}
  return {...p,x,prediction:tcnScore(model,x)};
})}));}
const groups=[];
for(const clip of frozen.manifest.clips)for(const[key,hz]of[['full',18],['full-6hz',6]]){
  const bytes=await readFile(path.join(DATA,'results',`${key}-${clip.id}.json`)),{record}=validateTrace(JSON.parse(bytes),clip.id),old=frozen.evaluation.groups.find(g=>g.id===clip.id);
  const times=sequenceWarnings(model,rows(record),recipe.policy),context={...clip,normalIntervals:old.normalIntervals};
  const candidate=continuousMetrics(times,context,{samplingHz:hz}),baseline=old.results[hz===18?'cycle5-weak':'cycle5-weak6Hz'];
  const role=recipe.split.edfTraining.includes(clip.subject)?'train':recipe.split.edfSelection.includes(clip.subject)?'selection':'seen-retest';
  groups.push({id:clip.id,subject:clip.subject,camera:clip.camera,samplingHz:hz,role,baseline,candidate,traceSha256:digest(bytes)});
}
const sum=values=>Object.fromEntries(['events','missed','falseEpisodes','normalWarningSeconds'].map(k=>[k,values.reduce((a,r)=>a+r[k],0)]));
const aggregate={};for(const hz of[18,6])aggregate[hz]={baseline:sum(groups.filter(g=>g.samplingHz===hz).map(g=>g.baseline)),candidate:sum(groups.filter(g=>g.samplingHz===hz).map(g=>g.candidate)),
  byRole:Object.fromEntries(['train','selection','seen-retest'].map(role=>[role,{baseline:sum(groups.filter(g=>g.samplingHz===hz&&g.role===role).map(g=>g.baseline)),candidate:sum(groups.filter(g=>g.samplingHz===hz&&g.role===role).map(g=>g.candidate))}]))};
const development=[];
for(const name of ['manifest.json','cauca-manifest.json','cauca-cycle2-manifest.json','ursul-manifest.json','uma-manifest.json'])for(const c of(await json(path.join(DATA,name))).clips){
  const{record}=validateTrace(await json(path.join(DATA,'results',`full-${c.id}.json`)),c.id),times=sequenceWarnings(model,rows(record),recipe.policy),prior=sequenceWarnings(frozen.model,sequenceRows(record),frozen.selection.policy);
  const accept=t=>c.fallStart===null||t>=c.fallStart&&(c.fallEnd===null||t<=c.fallEnd);
  development.push({id:c.id,label:c.label,baseline:c.label==='fall'?prior.some(accept):prior.length>0,candidate:c.label==='fall'?times.some(accept):times.length>0});
}
const dev={baseline:{missed:development.filter(r=>r.label==='fall'&&!r.baseline).length,false:development.filter(r=>r.label==='adl'&&r.baseline).length},candidate:{missed:development.filter(r=>r.label==='fall'&&!r.candidate).length,false:development.filter(r=>r.label==='adl'&&r.candidate).length}};
const report={designation:'Matched depth-coordinate ablation; source-normalization still estimated3D; all EDF data seen',modelSha256:digest(modelBytes),aggregate,development:dev,developmentPredictions:development,groups,deploy:false};
await publishJSON(path.join(out,'evaluation.json'),report);console.log(JSON.stringify({aggregate,development:dev},null,2));

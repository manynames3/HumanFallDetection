import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DATA,ROOT,frozenInputs,validateTrace,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
import {sequenceRowsLagV6} from './video_sequence_lag_v6.mjs';
import {sequenceWarnings} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
import {continuousMetrics} from './video_event_metrics.mjs';
const frozen=await frozenInputs(),out=path.join(DATA,'cycle6-lag-repair-final');
const variants=[{name:'lag-only',mode:'strict',repairLag:true},{name:'anchored-plus-lag',mode:'anchored',repairLag:true}];
const files=['browser/pose-tracker-v6.js','tools/video_sequence_lag_v6.mjs','tools/evaluate_lag_cycle6.mjs'];
const codeHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await readFile(path.join(ROOT,f)))])));
await publishJSON(path.join(out,'freeze.json'),{codeHashes,variants,policy:frozen.selection.policy,
  lagRule:'Latest actual same-track observation at or before target lag; age < min(.12s, one observed frame period); no interpolation/current missing evidence',archiveSha256:frozen.artifactsSha256,deploy:false});
const groups=[];
for(const clip of frozen.manifest.clips)for(const [key,hz] of [['full',18],['full-6hz',6]]){
  const bytes=await readFile(path.join(DATA,'results',`${key}-${clip.id}.json`)),{record}=validateTrace(JSON.parse(bytes),clip.id);
  const old=frozen.evaluation.groups.find(g=>g.id===clip.id),context={...clip,normalIntervals:old.normalIntervals},results={baseline:old.results[hz===18?'cycle5-weak':'cycle5-weak6Hz']};
  for(const v of variants){
    const rows=sequenceRowsLagV6(record,v),times=sequenceWarnings(frozen.model,rows,frozen.selection.policy);
    const metrics=continuousMetrics(times,context,{samplingHz:hz});
    const before=new Map(results.baseline.detections.map(e=>[e.id,e.detected]));
    results[v.name]={...metrics,rescued:metrics.detections.filter(e=>e.detected&&!before.get(e.id)).map(e=>e.id),newMisses:metrics.detections.filter(e=>!e.detected&&before.get(e.id)).map(e=>e.id)};
  }
  groups.push({id:clip.id,subject:clip.subject,camera:clip.camera,samplingHz:hz,traceSha256:digest(bytes),results});
}
const aggregate={};
for(const hz of [18,6])aggregate[hz]=Object.fromEntries(['baseline',...variants.map(v=>v.name)].map(name=>[name,Object.fromEntries(['missed','falseEpisodes','normalWarningSeconds'].map(k=>[k,groups.filter(g=>g.samplingHz===hz).reduce((a,g)=>a+g.results[name][k],0)]))]));
for(const [f,h]of Object.entries(codeHashes))assert.equal(digest(await readFile(path.join(ROOT,f))),h);
await publishJSON(path.join(out,'evaluation.json'),{designation:'Seen-data bounded lag repair; candidate selected only if both errors improve',codeHashes,aggregate,groups,deploy:false});
console.log(JSON.stringify(aggregate,null,2));

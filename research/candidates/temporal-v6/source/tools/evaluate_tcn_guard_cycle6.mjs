import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {DATA,ROOT,json,frozenInputs,validateTrace,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
import {guardedTCNRows} from './video_tcn_guard_v6.mjs';
import {sequenceWarnings,sequenceRows} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
import {continuousMetrics} from './video_event_metrics.mjs';
const out=path.join(DATA,'cycle6-tcn-guard'),frozen=await frozenInputs(),policy={windowSeconds:.6,evidenceSeconds:.15};
const configs=[];
for(const[name,folder,removeDepth]of[['depth','cycle6-tcn',false],['no-depth','cycle6-tcn-no-depth',true]]){
  const bytes=await readFile(path.join(DATA,folder,'model.json'));
  configs.push({name,model:JSON.parse(bytes),modelSha256:digest(bytes),removeDepth});
}
const codeFiles=['browser/pose-tracker-v6.js','tools/video_policy_v4.mjs','tools/video_tcn_v6.mjs','tools/video_tcn_guard_v6.mjs','tools/evaluate_tcn_guard_cycle6.mjs'];
const codeHashes=Object.fromEntries(await Promise.all(codeFiles.map(async f=>[f,digest(await readFile(path.join(ROOT,f)))])));
await publishJSON(path.join(out,'freeze.json'),{configs:configs.map(({model,...c})=>({...c,threshold:model.threshold})),codeHashes,policy,
  guard:'Existing bodyObservation upright stance with both complete observed leg chains; no new numerical cutoffs; current upright evidence resets classifier evidence, no state/alert rename',deploy:false});
const groups=[];
for(const clip of frozen.manifest.clips)for(const[key,hz]of[['full',18],['full-6hz',6]]){
  const bytes=await readFile(path.join(DATA,'results',`${key}-${clip.id}.json`)),{record}=validateTrace(JSON.parse(bytes),clip.id),old=frozen.evaluation.groups.find(g=>g.id===clip.id);
  const results={baseline:old.results[hz===18?'cycle5-weak':'cycle5-weak6Hz']};
  for(const c of configs){
    const rows=guardedTCNRows(c.model,record,c),times=sequenceWarnings(c.model,rows,policy);
    const metrics=continuousMetrics(times,{...clip,normalIntervals:old.normalIntervals},{samplingHz:hz});
    const before=new Map(results.baseline.detections.map(e=>[e.id,e.detected]));
    results[c.name]={...metrics,suppressedHighFrames:rows.reduce((n,f)=>n+f.people.filter(p=>p.uprightAffirmed&&p.rawPrediction>=c.model.threshold).length,0),
      rescued:metrics.detections.filter(e=>e.detected&&!before.get(e.id)).map(e=>e.id),newMisses:metrics.detections.filter(e=>!e.detected&&before.get(e.id)).map(e=>e.id)};
  }
  groups.push({id:clip.id,subject:clip.subject,camera:clip.camera,samplingHz:hz,results,traceSha256:digest(bytes)});
}
const sum=rows=>Object.fromEntries(['events','missed','falseEpisodes','normalWarningSeconds'].map(k=>[k,rows.reduce((a,r)=>a+r[k],0)]));
const aggregate={};for(const hz of[18,6])aggregate[hz]=Object.fromEntries(['baseline',...configs.map(c=>c.name)].map(name=>[name,sum(groups.filter(g=>g.samplingHz===hz).map(g=>g.results[name]))]));
const development=[];
for(const name of ['manifest.json','cauca-manifest.json','cauca-cycle2-manifest.json','ursul-manifest.json','uma-manifest.json'])for(const clip of(await json(path.join(DATA,name))).clips){
  const{record}=validateTrace(await json(path.join(DATA,'results',`full-${clip.id}.json`)),clip.id),prior=sequenceWarnings(frozen.model,sequenceRows(record),frozen.selection.policy);
  const accept=t=>clip.fallStart===null||t>=clip.fallStart&&(clip.fallEnd===null||t<=clip.fallEnd);
  const results={baseline:clip.label==='fall'?prior.some(accept):prior.length>0};
  for(const c of configs){const times=sequenceWarnings(c.model,guardedTCNRows(c.model,record,c),policy);results[c.name]=clip.label==='fall'?times.some(accept):times.length>0;}
  development.push({id:clip.id,label:clip.label,results});
}
const dev=Object.fromEntries(['baseline',...configs.map(c=>c.name)].map(name=>[name,{missed:development.filter(r=>r.label==='fall'&&!r.results[name]).length,false:development.filter(r=>r.label==='adl'&&r.results[name]).length}]));
const report={designation:'Seen-data standing-stance contradiction guard, fixed cutoffs, no deployment qualification',aggregate,development:dev,developmentPredictions:development,groups,codeHashes,deploy:false};
await publishJSON(path.join(out,'evaluation.json'),report);console.log(JSON.stringify({aggregate,development:dev,regressions:development.filter(r=>['cauca-s2-fall-sitting','uma-adl-walking','uma-adl-lying-down-and-getting-up-from-a-bed'].includes(r.id))},null,2));

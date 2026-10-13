import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DATA,ROOT,json,frozenInputs,validateTrace,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
import {tcnRows,tcnScore} from './video_tcn_v6.mjs';
import {sequenceWarnings,sequenceRows} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
import {continuousMetrics} from './video_event_metrics.mjs';
const out=path.join(DATA,'cycle6-tcn'),recipe=await json(path.join(out,'recipe.json')),modelBytes=await readFile(path.join(out,'model.json')),model=JSON.parse(modelBytes),frozen=await frozenInputs();
for(const[f,h]of Object.entries(recipe.codeHashes))assert.equal(digest(await readFile(path.join(ROOT,f))),h,'TCN source changed');
const reference=await json(path.join(out,'reference.json'));
for(let i=0;i<reference.inputs.length;i++)assert.ok(Math.abs(tcnScore(model,reference.inputs[i].flat())-reference.predictions[i])<1e-6,'JS/NumPy inference mismatch');
await publishJSON(path.join(out,'model-freeze.json'),{recipeSha256:digest(await readFile(path.join(out,'recipe.json'))),modelSha256:digest(modelBytes),
  policy:recipe.policy,threshold:model.threshold,codeHashes:recipe.codeHashes,selectedEpoch:model.selectedEpoch,deploy:false});
const groups=[];
for(const clip of frozen.manifest.clips)for(const[key,hz]of[['full',18],['full-6hz',6]]){
  const bytes=await readFile(path.join(DATA,'results',`${key}-${clip.id}.json`)),{record}=validateTrace(JSON.parse(bytes),clip.id);
  const original=frozen.evaluation.groups.find(g=>g.id===clip.id),context={...clip,normalIntervals:original.normalIntervals};
  const rows=tcnRows(record).map(f=>({...f,people:f.people.map(p=>({...p,prediction:tcnScore(model,p.x)}))}));
  const times=sequenceWarnings(model,rows,recipe.policy),metrics=continuousMetrics(times,context,{samplingHz:hz});
  const baseline=original.results[hz===18?'cycle5-weak':'cycle5-weak6Hz'];
  const role=recipe.split.edfTraining.includes(clip.subject)?'train':recipe.split.edfSelection.includes(clip.subject)?'selection':'seen-retest';
  groups.push({id:clip.id,subject:clip.subject,camera:clip.camera,samplingHz:hz,role,baseline,candidate:metrics,traceSha256:digest(bytes)});
  console.log(`TCN ${clip.id} ${hz}Hz: ${metrics.missed} missed/${metrics.falseEpisodes} false`);
}
const sum=rows=>Object.fromEntries(['events','missed','falseEpisodes','normalSeconds','normalWarningSeconds'].map(k=>[k,rows.reduce((a,r)=>a+r[k],0)]));
const aggregate={};
for(const hz of[18,6])aggregate[hz]={baseline:sum(groups.filter(g=>g.samplingHz===hz).map(g=>g.baseline)),candidate:sum(groups.filter(g=>g.samplingHz===hz).map(g=>g.candidate)),
  byRole:Object.fromEntries(['train','selection','seen-retest'].map(role=>[role,{baseline:sum(groups.filter(g=>g.samplingHz===hz&&g.role===role).map(g=>g.baseline)),candidate:sum(groups.filter(g=>g.samplingHz===hz&&g.role===role).map(g=>g.candidate))}]))};
const development=[];
for(const name of ['manifest.json','cauca-manifest.json','cauca-cycle2-manifest.json','ursul-manifest.json','uma-manifest.json'])for(const clip of(await json(path.join(DATA,name))).clips){
  const{record}=validateTrace(await json(path.join(DATA,'results',`full-${clip.id}.json`)),clip.id);
  const rows=tcnRows(record).map(f=>({...f,people:f.people.map(p=>({...p,prediction:tcnScore(model,p.x)}))}));
  const times=sequenceWarnings(model,rows,recipe.policy),prior=sequenceWarnings(frozen.model,sequenceRows(record),frozen.selection.policy);
  const accept=t=>clip.fallStart===null||t>=clip.fallStart&&(clip.fallEnd===null||t<=clip.fallEnd);
  development.push({id:clip.id,label:clip.label,baseline:clip.label==='fall'?prior.some(accept):prior.length>0,candidate:clip.label==='fall'?times.some(accept):times.length>0});
}
const dev={baseline:{missed:development.filter(r=>r.label==='fall'&&!r.baseline).length,false:development.filter(r=>r.label==='adl'&&r.baseline).length},candidate:{missed:development.filter(r=>r.label==='fall'&&!r.candidate).length,false:development.filter(r=>r.label==='adl'&&r.candidate).length},falls:development.filter(r=>r.label==='fall').length,ordinary:development.filter(r=>r.label==='adl').length};
const b=aggregate[18].baseline,c=aggregate[18].candidate,ret=aggregate[18].byRole['seen-retest'];
const gates={aggregateBothBetter:c.missed<b.missed&&c.falseEpisodes<b.falseEpisodes,
  seenRetestBothBetter:ret.candidate.missed<ret.baseline.missed&&ret.candidate.falseEpisodes<ret.baseline.falseEpisodes,
  developmentNotWorse:dev.candidate.missed<=dev.baseline.missed&&dev.candidate.false<=dev.baseline.false,
  lowRateNotWorse:aggregate[6].candidate.missed<=aggregate[6].baseline.missed&&aggregate[6].candidate.falseEpisodes<=aggregate[6].baseline.falseEpisodes,
  noMoreNormalWarningTime:c.normalWarningSeconds<=b.normalWarningSeconds};
const report={designation:'TCN participant-split seen development; source labels, estimated depth, no new-person qualification yet',modelSha256:digest(modelBytes),aggregate,development:dev,developmentPredictions:development,gates,groups,deploy:false};
await publishJSON(path.join(out,'evaluation.json'),report);console.log(JSON.stringify({aggregate,development:dev,gates},null,2));

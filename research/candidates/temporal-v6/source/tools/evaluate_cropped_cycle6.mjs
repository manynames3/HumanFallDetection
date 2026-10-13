import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {digest} from './video_checkpoint.mjs';
import {DATA,ROOT,frozenInputs,validateTrace,publishJSON} from './video_diagnostics_v6.mjs';
import {sequenceRows,sequenceWarnings} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
import {sequenceRowsV6} from './video_sequence_v6.mjs';
import {continuousMetrics} from './video_event_metrics.mjs';
const frozen=await frozenInputs(),out=path.join(DATA,'cycle6-repair');
const variants=[{name:'anchored',mode:'anchored'},{name:'history-only',mode:'anchored',historyOnly:true},{name:'no-anchor-control',mode:'unanchored'}];
const codeFiles=['browser/pose-tracker-v6.js','tools/video_sequence_v6.mjs','tools/evaluate_cropped_cycle6.mjs'];
const codeHashes=Object.fromEntries(await Promise.all(codeFiles.map(async f=>[f,digest(await readFile(path.join(ROOT,f)))])));
await publishJSON(path.join(out,'freeze.json'),{archiveSha256:frozen.artifactsSha256,codeHashes,variants,policy:frozen.selection.policy,
  constants:{minimumTorsoFraction:.5,fullFrameAnchorSeconds:1,threshold:frozen.model.threshold},
  designation:'Prespecified seen-data repair/ablation; no fitting or threshold selection; reserved Ursul remains unopened until primary passes',deploy:false});
const groups=[];
for(const clip of frozen.manifest.clips)for(const [key,hz] of [['full',18],['full-6hz',6]]){
  const bytes=await readFile(path.join(DATA,'results',`${key}-${clip.id}.json`)),saved=JSON.parse(bytes),{record}=validateTrace(saved,clip.id);
  if(saved._checkpoint?.contract.videoSha256!==clip.sha256||saved._checkpoint?.contract.inferenceSha256!==frozen.evaluation.inferenceHashes[key])throw new Error('Frozen pose trace provenance mismatch');
  const original=frozen.evaluation.groups.find(g=>g.id===clip.id),context={...clip,normalIntervals:original.normalIntervals};
  const baselineRows=sequenceRows(record),strict=sequenceRowsV6(record,{mode:'strict'});
  assert.deepEqual(strict.map(f=>({...f,people:f.people.map(({cropped,...p})=>p)})),baselineRows,'Strict path changed frozen tracking/features');
  const baselineTimes=sequenceWarnings(frozen.model,baselineRows,frozen.selection.policy);
  const baseline=continuousMetrics(baselineTimes,context,{samplingHz:hz});
  assert.deepEqual(baseline,original.results[hz===18?'cycle5-weak':'cycle5-weak6Hz'],'Frozen metric mismatch');
  const results={baseline};
  for(const variant of variants){
    const rows=sequenceRowsV6(record,variant),times=sequenceWarnings(frozen.model,rows,frozen.selection.policy);
    const metrics=continuousMetrics(times,context,{samplingHz:hz});
    const before=new Map(baseline.detections.map(e=>[e.id,e.detected]));
    results[variant.name]={...metrics,croppedFrames:rows.filter(f=>f.people.some(p=>p.cropped)).length,
      rescued:metrics.detections.filter(e=>e.detected&&!before.get(e.id)).map(e=>e.id),newMisses:metrics.detections.filter(e=>!e.detected&&before.get(e.id)).map(e=>e.id)};
  }
  groups.push({id:clip.id,subject:clip.subject,camera:clip.camera,samplingHz:hz,traceSha256:digest(bytes),results});
  console.log(`Replayed ${clip.id} ${hz}Hz`);
}
const aggregate={};
for(const hz of [18,6]){
  aggregate[hz]={};
  for(const name of ['baseline',...variants.map(v=>v.name)]){
    const rows=groups.filter(g=>g.samplingHz===hz).map(g=>g.results[name]);
    aggregate[hz][name]=Object.fromEntries(['events','missed','falseEpisodes','normalSeconds','normalWarningSeconds','croppedFrames'].map(k=>[k,rows.reduce((a,r)=>a+(r[k]??0),0)]));
  }
}
const b=aggregate[18].baseline,c=aggregate[18].anchored,low=aggregate[6];
const gates={bothBetterThanNative:c.missed<b.missed&&c.falseEpisodes<b.falseEpisodes,
  bothBetterThanProduction:c.missed<frozen.evaluation.aggregate.productionLite.missed&&c.falseEpisodes<frozen.evaluation.aggregate.productionLite.falseEpisodes,
  bothBetterThanPrior:c.missed<frozen.evaluation.aggregate.prior.missed&&c.falseEpisodes<frozen.evaluation.aggregate.prior.falseEpisodes,
  noMoreNormalWarningTime:c.normalWarningSeconds<=b.normalWarningSeconds,
  lowRateNotWorse:low.anchored.missed<=low.baseline.missed&&low.anchored.falseEpisodes<=low.baseline.falseEpisodes};
for(const [f,h] of Object.entries(codeHashes))assert.equal(digest(await readFile(path.join(ROOT,f))),h,'Code changed during replay');
const report={designation:'Seen EDF development repair comparison; correlated paired views; not new-person qualification',codeHashes,aggregate,gates,groups,deploy:false};
await publishJSON(path.join(out,'cropped-evaluation.json'),report);
console.log(JSON.stringify({aggregate,gates},null,2));

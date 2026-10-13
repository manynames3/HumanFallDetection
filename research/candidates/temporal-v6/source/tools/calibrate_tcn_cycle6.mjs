// Fixed conservative operating points, selected only on the existing selection split.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {DATA,json,frozenInputs,validateTrace,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
import {tcnRows,tcnScore} from './video_tcn_v6.mjs';
import {sequenceRows,sequenceWarnings} from '../research/candidates/native-sequence-v5/inference/tools/video_sequence_v5.mjs';
import {continuousMetrics} from './video_event_metrics.mjs';
const out=path.join(DATA,'cycle6-tcn-calibration'),frozen=await frozenInputs(),bytes=await readFile(path.join(DATA,'cycle6-tcn/model.json')),model=JSON.parse(bytes);
const points=[.98,.995,.999],policy={windowSeconds:.6,evidenceSeconds:.15};
await publishJSON(path.join(out,'freeze.json'),{modelSha256:digest(bytes),points,policy,
  selection:'Strictly fewer original selection misses AND false clips than native baseline, plus strictly fewer EDF-selection misses AND false episodes. Among eligible choose minimum combined misses then false. No retest/heldout used.',
  toolSha256:digest(await readFile(new URL(import.meta.url))),deploy:false});
const ids=new Set((await json(path.join(DATA,'cycle3/fusion-selection.json'))).provenance.validationClipIds);
const clips=[];
for(const name of ['manifest.json','cauca-manifest.json','cauca-cycle2-manifest.json','ursul-manifest.json','uma-manifest.json'])clips.push(...(await json(path.join(DATA,name))).clips.filter(c=>ids.has(c.id)));
const count={baseline:{missed:0,false:0},points:Object.fromEntries(points.map(t=>[t,{missed:0,false:0}]))};
for(const c of clips){
  const{record}=validateTrace(await json(path.join(DATA,'results',`full-${c.id}.json`)),c.id);
  const rows=tcnRows(record).map(f=>({...f,people:f.people.map(p=>({...p,prediction:tcnScore(model,p.x)}))}));
  const base=sequenceWarnings(frozen.model,sequenceRows(record),frozen.selection.policy),accept=t=>c.fallStart===null||t>=c.fallStart&&(c.fallEnd===null||t<=c.fallEnd);
  if(c.label==='fall'&&!base.some(accept))count.baseline.missed++;if(c.label==='adl'&&base.length)count.baseline.false++;
  for(const t of points){const times=sequenceWarnings({...model,threshold:t},rows,policy);if(c.label==='fall'&&!times.some(accept))count.points[t].missed++;if(c.label==='adl'&&times.length)count.points[t].false++;}
}
const edf={baseline:{missed:0,falseEpisodes:0},points:Object.fromEntries(points.map(t=>[t,{missed:0,falseEpisodes:0}]))};
for(const c of frozen.manifest.clips.filter(c=>c.subject==='edf-songsong')){
  const old=frozen.evaluation.groups.find(g=>g.id===c.id),context={...c,normalIntervals:old.normalIntervals};
  const{record}=validateTrace(await json(path.join(DATA,'results',`full-${c.id}.json`)),c.id);
  const rows=tcnRows(record).map(f=>({...f,people:f.people.map(p=>({...p,prediction:tcnScore(model,p.x)}))}));
  for(const k of['missed','falseEpisodes'])edf.baseline[k]+=old.results['cycle5-weak'][k];
  for(const t of points){const m=continuousMetrics(sequenceWarnings({...model,threshold:t},rows,policy),context);for(const k of['missed','falseEpisodes'])edf.points[t][k]+=m[k];}
}
const eligible=points.filter(t=>count.points[t].missed<count.baseline.missed&&count.points[t].false<count.baseline.false&&edf.points[t].missed<edf.baseline.missed&&edf.points[t].falseEpisodes<edf.baseline.falseEpisodes);
eligible.sort((a,b)=>count.points[a].missed+edf.points[a].missed-count.points[b].missed-edf.points[b].missed||count.points[a].false+edf.points[a].falseEpisodes-count.points[b].false-edf.points[b].falseEpisodes);
const report={modelSha256:digest(bytes),originalSelection:count,edfSelection:edf,eligible,selectedThreshold:eligible[0]??null,
  designation:'Seen selection calibration only; no retest or reserved subjects opened; failed operating points do not authorize threshold changes',deploy:false};
await publishJSON(path.join(out,'selection.json'),report);console.log(JSON.stringify(report,null,2));

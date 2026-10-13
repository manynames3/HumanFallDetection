import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {DATA,ROOT,json,frozenInputs,validateTrace,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
import {supervisedLabel} from './video_features_v2.mjs';
import {tcnRows,mirrorTCN,TCN_DIM,TCN_STEPS} from './video_tcn_v6.mjs';
const out=path.join(DATA,'cycle6-tcn'),frozen=await frozenInputs();await mkdir(out,{recursive:true});
const split=(await json(path.join(DATA,'cycle3/fusion-selection.json'))).provenance;
const train=new Set(split.trainingClipIds),selection=new Set(split.validationClipIds);
const groups=[];
for(const name of ['manifest.json','cauca-manifest.json','cauca-cycle2-manifest.json','ursul-manifest.json','uma-manifest.json'])for(const c of(await json(path.join(DATA,name))).clips){
  if(!train.has(c.id)&&!selection.has(c.id))throw new Error('Unknown development group');
  groups.push({...c,role:train.has(c.id)?'train':'selection',labelAt:t=>{
    const y=supervisedLabel(c,t);return y===1&&c.fallStart!==null&&t>c.fallStart+3?null:y;
  }});
}
for(const c of frozen.manifest.clips){
  const g=frozen.evaluation.groups.find(g=>g.id===c.id);
  const role=['edf-jianjun','edf-jinhui','edf-peter'].includes(c.subject)?'train':c.subject==='edf-songsong'?'selection':'seen-retest';
  groups.push({...c,role,labelAt:t=>{
    if(c.events.some(e=>t>=e.start+.15&&t<=e.processEnd+.75))return 1;
    return g.normalIntervals.some(([a,b])=>t>=a&&t<b)?0:null;
  }});
}
const codeFiles=['browser/pose-tracker-v6.js','tools/video_tcn_v6.mjs','tools/prepare_tcn_cycle6.mjs','tools/train_tcn_cycle6.py'];
const codeHashes=Object.fromEntries(await Promise.all(codeFiles.map(async f=>[f,digest(await readFile(path.join(ROOT,f)))])));
const recipe={version:1,steps:TCN_STEPS,dim:TCN_DIM,hidden:16,kernel:5,dilation:3,seed:61107,epochs:40,batchSize:128,rate:.001,
  threshold:.98,policy:{windowSeconds:.6,evidenceSeconds:.15},codeHashes,archiveSha256:frozen.artifactsSha256,
  split:{edfTraining:['edf-jianjun','edf-jinhui','edf-peter'],edfSelection:['edf-songsong'],edfSeenRetest:['edf-zhong'],reservedUrsulSubjects:[16,17,18,24,25,26]},
  supervision:'Publisher event/frame/clip labels only. Unknown onsets omitted. EDF post-process .75s is causal recent-event target; reviewed normal prefix/tail labels0. Ambiguous intermediate intervals omitted.',
  selectionRule:'Two fixed epoch checkpoints20/40; minimum weighted selection BCE. No threshold/policy search. EDF is seen development, not a fresh holdout.',deploy:false};
await publishJSON(path.join(out,'recipe.json'),recipe);
for(const role of ['train','selection']){
  const samples=[],inputs=[];
  for(const c of groups.filter(g=>g.role===role)){
    const bytes=await readFile(path.join(DATA,'results',`full-${c.id}.json`)),{record}=validateTrace(JSON.parse(bytes),c.id),rows=tcnRows(record),valid=[];
    for(const [i,f]of rows.entries()){
      if(i%3)continue;const label=c.labelAt(f.t);if(label===null)continue;
      for(const p of f.people)if(p.x&&(label===0||f.people.length===1))valid.push({x:p.x,y:label,t:f.t});
    }
    for(const s of valid){const weight=1/valid.length;samples.push({...s,weight,clip:c.id});if(role==='train')samples.push({...s,x:mirrorTCN(s.x),weight,clip:c.id});}
    inputs.push({id:c.id,subject:c.subject,sha256:digest(bytes),samples:valid.length});
  }
  const x=new Float32Array(samples.length*TCN_DIM*TCN_STEPS),y=new Uint8Array(samples.length),w=new Float32Array(samples.length);
  for(const [i,s]of samples.entries()){x.set(s.x,i*TCN_DIM*TCN_STEPS);y[i]=s.y;w[i]=s.weight;}
  const files={};
  for(const [name,value]of [['x.f32',x],['y.u8',y],['w.f32',w]]){
    const bytes=Buffer.from(value.buffer),file=path.join(out,role+'-'+name);
    try{await writeFile(file,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||digest(await readFile(file))!==digest(bytes))throw e;}
    files[name]={sha256:digest(bytes),bytes:bytes.length};
  }
  await publishJSON(path.join(out,role+'-data.json'),{samples:samples.length,positive:samples.filter(s=>s.y===1).length,shape:[samples.length,TCN_STEPS,TCN_DIM],files,inputs,
    samplesMeta:samples.map(({x,...s})=>s)});
  console.log({role,samples:samples.length,positive:samples.filter(s=>s.y===1).length});
}

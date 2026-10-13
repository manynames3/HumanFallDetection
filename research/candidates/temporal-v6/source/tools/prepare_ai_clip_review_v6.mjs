// Source contact sheets for AI-assisted diagnosis; these are not human gold labels.
import {mkdir,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {DATA,OUTPUT,json,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
const run=promisify(execFile),out=path.join(DATA,'cycle6-ai-review');
await mkdir(out,{recursive:true});
const summary=await json(path.join(OUTPUT,'summary.json'));
const provenance=await json(path.join(OUTPUT,'audit/provenance.json'));
const manifest=await json(path.join(DATA,'cycle5-edf-manifest.json'));
const uma=await json(path.join(DATA,'uma-manifest.json'));
const clips=new Map([...manifest.clips,...uma.clips].map(c=>[c.id,c]));
const chosen=provenance.cases.filter(c=>c.kind==='mined-normal-warning');
for(const predicate of [e=>e.stage==='noPose',e=>!e.detected&&e.phases.during.poseCoverage>.8&&e.phases.during.eligibleCoverage<.8,
  e=>!e.detected&&e.scoring.eligibleCoverage>=.9,e=>e.stage==='neverAboveThreshold'&&e.phases.during.poseCoverage<.6,
  e=>e.detected&&e.phases.during.eligibleCoverage>=.9]){
  for(const e of summary.events.filter(predicate).slice(0,3)){
    const c=provenance.cases.find(c=>c.eventId===e.id);if(c&&!chosen.some(x=>x.id===c.id))chosen.push(c);
  }
}
for(const id of ['uma-adl-walking','uma-adl-lying-down-and-getting-up-from-a-bed']){
  const rows=provenance.cases.filter(c=>c.clipId===id);chosen.push(rows[Math.floor(rows.length/2)]);
}
const ledger=[];
for(const [i,c] of chosen.entries()){
  const clip=clips.get(c.clipId),label=`C${String(i+1).padStart(2,'0')}`;
  const indices=Array.from({length:6},(_,j)=>Math.floor((c.start+(c.end-c.start)*j/6)*18));
  const times=indices.map(n=>n/18);
  const inputs=indices.flatMap(n=>['-i',path.join(DATA,'frames',clip.id,String(n).padStart(5,'0')+'.png')]);
  const image=path.join(out,label+'.jpg');
  const filters=indices.map((_,j)=>`[${j}:v]scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2[p${j}]`).join(';')+';'+indices.map((_,j)=>`[p${j}]`).join('')+'hstack=inputs=6';
  await run('ffmpeg',['-v','error',...inputs,'-filter_complex',filters,'-frames:v','1','-q:v','3','-y',image]);
  ledger.push({label,image,path:clip.path,start:c.start,end:c.end,times,clipId:c.clipId,eventId:c.eventId??null,kind:c.kind,sourceImageSha256:digest(await readFile(image))});
}
for(let i=0;i<ledger.length;i+=4){
  const rows=ledger.slice(i,i+4),target=path.join(out,`sheet-${String(i/4+1).padStart(2,'0')}.jpg`);
  const filter=rows.length===1?['-vf','null']:['-filter_complex',rows.map((_,j)=>`[${j}:v]`).join('')+`vstack=inputs=${rows.length}`];
  await run('ffmpeg',['-v','error',...rows.flatMap(r=>['-i',r.image]),...filter,'-frames:v','1','-q:v','3','-y',target]);
}
await publishJSON(path.join(out,'ledger.json'),{designation:'AI-assisted source review, selected seen failures/controls, not independent human annotations',cases:ledger});
console.log(JSON.stringify({out,cases:ledger.length,sheets:Math.ceil(ledger.length/4)}));

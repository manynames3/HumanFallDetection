// Preselect unused participants from an already verified local archive, before scoring.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {DATA,json,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
const run=promisify(execFile),archive=path.join(DATA,'figshare/28596332-VideoDataset.zip');
const metadata=await json(path.join(DATA,'figshare/28596332-metadata.json'));
if(metadata.license?.name!=='CC BY 4.0')throw new Error('Cached source license mismatch');
const md5=createHash('md5');let size=0;for await(const bytes of createReadStream(archive)){md5.update(bytes);size+=bytes.length;}
if(size!==metadata.files[0].size||md5.digest('hex')!==metadata.files[0].computed_md5)throw new Error('Cached source archive changed');
const previous=['manifest.json','cauca-manifest.json','cauca-cycle2-manifest.json','ursul-manifest.json','uma-manifest.json','cycle3-ikar-manifest.json','cycle3-fallvision-manifest.json','cycle3-ursul-manifest.json','cycle4-assist-manifest.json','cycle4-ursul-manifest.json','cycle5-edf-manifest.json'];
const subjects=new Set(),seen=new Set();
for(const name of previous)for(const c of (await json(path.join(DATA,name))).clips){subjects.add(c.subject);seen.add(c.sha256);}
const members=(await run('bsdtar',['-tf',archive],{maxBuffer:8000000})).stdout.split('\n');
const clips=[];
for(const [label,ids,activities] of [['fall',[16,17,18],[1,4,8,11]],['adl',[24,25,26],[13,16,19,20]]])for(const subject of ids){
  if(subjects.has(`ursul-${subject}`))throw new Error('Participant already opened');
  for(const activity of activities){
    const pool=members.filter(member=>new RegExp(`^VideoDataset/${label==='fall'?'Fall':'ADL'}/SBJ_${String(subject).padStart(2,'0')}_LOC\\d+/ACT${activity}_[A-Z]_\\d+/[^/]+\\.mp4$`).test(member)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if(!pool.length)throw new Error(`Missing preregistered activity ${subject}/${activity}`);
    const member=pool[0],id=`cycle6-ursul-s${subject}-${label}-act${activity}`;
    const bytes=(await run('bsdtar',['-xOf',archive,member],{encoding:'buffer',maxBuffer:150000000})).stdout;
    const sha256=digest(bytes);if(seen.has(sha256))throw new Error('Exact duplicate footage');seen.add(sha256);
    const relative=`Ursul/${id}.mp4`;await mkdir(path.join(DATA,'Ursul'),{recursive:true});
    try{await writeFile(path.join(DATA,relative),bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||digest(await readFile(path.join(DATA,relative)))!==sha256)throw e;}
    clips.push({id,subject:`ursul-${subject}`,label,split:'external',path:relative,url:'/tests/fixtures/generated/video-benchmark/'+relative,sha256,
      sourceMember:member,location:Number(/LOC(\d+)/.exec(member)[1]),activity,fallStart:null,fallEnd:null,
      sourceAnnotation:'Author activity/clip label only. No verified video onset. Participant not previously opened.',sourceUrl:metadata.files[0].download_url});
  }
}
const manifest={dataset:'Cycle6 reserved Ursul participants',samplingHz:18,source:metadata.url_public_html,license:metadata.license,
  attribution:'Ivan Ursul (2025)',selection:'Prespecified subjects16/17/18falls and24/25/26ordinary; activities1/4/8/11 and13/16/19/20; first numeric direction/repetition; no prediction selection',
  limitations:['New subject IDs, but LOC1 and source phone hardware are already seen; no claim of new physical camera models.',
    'Short author-labelled clips, not continuous event sensitivity or camera-day false-alert exposure.'],clips};
await publishJSON(path.join(DATA,'cycle6-ursul-manifest.json'),manifest);
console.log(JSON.stringify({clips:clips.length,falls:clips.filter(c=>c.label==='fall').length,ordinary:clips.filter(c=>c.label==='adl').length,subjects:[...new Set(clips.map(c=>c.subject))],manifestSha256:digest(JSON.stringify(manifest,null,2)+'\n')}));

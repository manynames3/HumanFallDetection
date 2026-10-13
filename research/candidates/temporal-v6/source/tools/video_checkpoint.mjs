// A checkpoint is a complete, integrity-checked clip, never a partial temporal state.
import {readFile,writeFile,mkdir,link,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const VISION_RUNTIME_FILES=['browser/vendor/vision_bundle.mjs',
  'browser/vendor/wasm/vision_wasm_internal.js','browser/vendor/wasm/vision_wasm_internal.wasm',
  'browser/vendor/wasm/vision_wasm_nosimd_internal.js','browser/vendor/wasm/vision_wasm_nosimd_internal.wasm'];
export async function fingerprintFiles(root,files){
  const assets={};
  for(const name of [...files].sort()){
    if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..')||Object.hasOwn(assets,name))throw new Error('Unsafe or duplicate fingerprint path');
    const bytes=await readFile(path.join(root,name));assets[name]={sha256:digest(bytes),bytes:bytes.length};
  }
  return assets;
}
function validate(record,id,expectedFrames){
  if(record?.clip?.id!==id||!Array.isArray(record.frames)||!record.frames.length||record.frames.length!==record.clip.frames)throw new Error(`Incomplete clip: ${id}`);
  if(expectedFrames!==undefined&&record.frames.length!==expectedFrames)throw new Error(`Incomplete requested frames: ${id}`);
  if(record.frames.some((f,i)=>!Number.isFinite(f.t)||i>0&&f.t<=record.frames[i-1].t))throw new Error(`Invalid frame clock: ${id}`);
}
async function load(file,job){
  let saved;try{saved=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const {_checkpoint,...record}=saved;
  if(_checkpoint?.version!==1||_checkpoint.contractSha256!==digest(job.contract)||_checkpoint.contractSha256!==digest(_checkpoint.contract))throw new Error(`Checkpoint contract mismatch: ${job.id}; use a new output directory`);
  if(_checkpoint.recordSha256!==digest(record))throw new Error(`Checkpoint integrity mismatch: ${job.id}`);
  validate(record,job.clipId??job.id,job.contract.expectedFrames);return record;
}
export async function runCheckpointed({dir,jobs,execute,onComplete=()=>{}}){
  await mkdir(dir,{recursive:true});const completed=[];
  for(const job of jobs){
    if(!/^[a-z0-9-]+$/.test(job.id))throw new Error('Unsafe checkpoint ID');
    const file=path.join(dir,job.id+'.json');let record=await load(file,job),resumed=Boolean(record);
    if(!record){
      record=await execute(job);validate(record,job.clipId??job.id,job.contract.expectedFrames);
      const saved={...record,_checkpoint:{version:1,contractSha256:digest(job.contract),recordSha256:digest(record),contract:job.contract}};
      const temp=file+'.'+randomUUID()+'.partial';
      try{
        await writeFile(temp,JSON.stringify(saved)+'\n',{flag:'wx'});
        // Atomic publication, without overwriting another process's completed clip.
        try{await link(temp,file);}catch(error){if(error.code!=='EEXIST')throw error;record=await load(file,job);resumed=true;}
      }finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    }
    completed.push(record.clip);await onComplete({job,record,resumed,completed:completed.length,total:jobs.length});
  }
  return completed;
}

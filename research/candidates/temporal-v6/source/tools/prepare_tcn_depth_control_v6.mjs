// One-variable ablation: remove explicit depth channels, retain timing/normalization.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DATA,json,publishJSON} from './video_diagnostics_v6.mjs';
import {digest} from './video_checkpoint.mjs';
const source=path.join(DATA,'cycle6-tcn'),out=path.join(DATA,'cycle6-tcn-no-depth');await mkdir(out,{recursive:true});
const recipe=await json(path.join(source,'recipe.json'));
recipe.featureAblation='Explicit joint depth and hip-depth motion set to0; original 3D torso normalization retained. Not a pure 2D geometry claim.';
recipe.codeHashes['tools/prepare_tcn_depth_control_v6.mjs']=digest(await readFile(fileURLToPath(import.meta.url)));
await publishJSON(path.join(out,'recipe.json'),recipe);
for(const role of ['train','selection']){
  const meta=await json(path.join(source,role+'-data.json'));
  for(const[name,expected]of Object.entries(meta.files)){
    let bytes=await readFile(path.join(source,role+'-'+name));
    if(digest(bytes)!==expected.sha256)throw new Error('Source training dataset changed');
    if(name==='x.f32'){
      const values=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
      for(let i=0;i<values.length;i+=recipe.dim){for(let j=0;j<13;j++)values[i+j*4+2]=0;values[i+55]=0;}
      bytes=Buffer.from(values.buffer);
    }
    const file=path.join(out,role+'-'+name);
    try{await writeFile(file,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||digest(await readFile(file))!==digest(bytes))throw e;}
    meta.files[name]={sha256:digest(bytes),bytes:bytes.length};
  }
  await publishJSON(path.join(out,role+'-data.json'),meta);
}
console.log(out);

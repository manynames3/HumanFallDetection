import {cp,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(resolve(root,'browser/vendor'),{recursive:true});
await cp(resolve(root,'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'),resolve(root,'browser/vendor/vision_bundle.mjs'));
await cp(resolve(root,'node_modules/@mediapipe/tasks-vision/wasm'),resolve(root,'browser/vendor/wasm'),{recursive:true});
await cp(resolve(root,'LICENSE'),resolve(root,'browser/LICENSE.txt'));
// The published npm tarball declares Apache-2.0 but does not ship LICENSE.
const licenseResponse=await fetch('https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.32/LICENSE');
if(!licenseResponse.ok)throw new Error('Could not retrieve the official MediaPipe license');
await writeFile(resolve(root,'browser/MEDIAPIPE-LICENSE.txt'),await licenseResponse.text());
const manifest=JSON.parse(await readFile(resolve(root,'browser/models/lstm.json')));
const hash=createHash('sha256').update(await readFile(resolve(root,'browser/models/lstm.bin'))).digest('hex');
if(hash!==manifest.binary_sha256)throw new Error('Classifier weights integrity mismatch');
const pose=resolve(root,'browser/models/pose_landmarker_lite.task');
try{await stat(pose);}catch(error){
  if(error.code!=='ENOENT')throw error;
  const response=await fetch('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task');
  if(!response.ok)throw new Error('Pose model download failed');
  await writeFile(pose,new Uint8Array(await response.arrayBuffer()));
}
const poseHash=createHash('sha256').update(await readFile(pose)).digest('hex');
if(poseHash!=='59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a')throw new Error('Pose model integrity mismatch');
for(const file of ['vision_wasm_internal.wasm','vision_wasm_internal.js'])await stat(resolve(root,'browser/vendor/wasm',file));
console.log('Built self-hosted static browser app; classifier and pose-model hashes verified.');

import {PoseLandmarker,FilesetResolver} from './vendor/vision_bundle.mjs';
import {Detector} from './detector.js';
import {poseFromLandmarks} from './features.js';

let model, detector;
async function load() {
  const [manifestResponse,weightsResponse,vision]=await Promise.all([
    fetch('./models/lstm.json'),fetch('./models/lstm.bin'),FilesetResolver.forVisionTasks('./vendor/wasm')]);
  if (!manifestResponse.ok || !weightsResponse.ok) throw new Error('Classifier download failed');
  const manifest=await manifestResponse.json(), buffer=await weightsResponse.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if (hash!==manifest.binary_sha256) throw new Error('Classifier integrity check failed');
  detector=new Detector(manifest,buffer);
  model=await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'./models/pose_landmarker_lite.task',delegate:'CPU'},
    runningMode:'VIDEO',numPoses:4,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
  postMessage({type:'ready'});
}
onmessage=async ({data}) => {
  if (data.type==='load') {
    try {await load();} catch(error) {postMessage({type:'error',message:error.message});}
    return;
  }
  if (data.type!=='frame') return;
  const {bitmap,timestamp}=data;
  try {
    const began=performance.now();
    const landmarks=model.detectForVideo(bitmap,timestamp).landmarks;
    const poses=landmarks.map(p=>poseFromLandmarks(p,bitmap.width,bitmap.height,timestamp/1000)).filter(Boolean);
    const people=detector.update(poses,timestamp/1000);
    postMessage({type:'result',timestamp,people,width:bitmap.width,height:bitmap.height,
      detected:landmarks.length,inferenceMs:performance.now()-began});
  } catch(error) {postMessage({type:'error',message:error.message});}
  finally {bitmap.close();}
};

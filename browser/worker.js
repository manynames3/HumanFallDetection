// Classic worker is required by the Emscripten loader's importScripts path.
// App/model modules remain ES modules, dynamically imported within this worker.
let model, detector, poseFromLandmarks, downMonitor,postureEnabled=true;
async function load() {
  const [{PoseLandmarker,FilesetResolver},{Detector},featureModule,{PersonDownMonitor}]=await Promise.all([
    import('./vendor/vision_bundle.mjs'),import('./detector.js'),import('./features.js'),import('./person-down.js')]);
  downMonitor=new PersonDownMonitor();
  poseFromLandmarks=featureModule.poseFromLandmarks;
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
  if(data.type==='zones'){downMonitor?.configure(data.zones);postureEnabled=data.enabled!==false;return;}
  if (data.type!=='frame') return;
  const {bitmap,timestamp}=data;
  try {
    const began=performance.now();
    const landmarks=model.detectForVideo(bitmap,timestamp).landmarks;
    const poses=landmarks.map(p=>poseFromLandmarks(p,bitmap.width,bitmap.height,timestamp/1000)).filter(Boolean);
    const tracked=detector.update(poses,timestamp/1000);
    const people=postureEnabled?downMonitor.update(tracked,timestamp/1000,bitmap.width,bitmap.height):tracked;
    postMessage({type:'result',timestamp,people,width:bitmap.width,height:bitmap.height,
      detected:landmarks.length,inferenceMs:performance.now()-began});
  } catch(error) {postMessage({type:'error',message:error.message});}
  finally {bitmap.close();}
};

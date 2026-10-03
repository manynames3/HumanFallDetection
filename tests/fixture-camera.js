// Local QA only. The fixture server injects this; production never ships it.
const publicImage=new Image();publicImage.src='/tests/fixtures/generated/pose.jpg';
const synthetic=new URL(location.href).searchParams.has('down');
if(synthetic){const ActualWorker=window.Worker;window.Worker=class extends ActualWorker{constructor(){super('/tests/down-fixture-worker.js',{type:'module'});}};}
navigator.mediaDevices.getUserMedia=async()=>{
  if(new URL(location.href).searchParams.has('denied'))throw new DOMException('QA denied permission','NotAllowedError');
  await publicImage.decode();const canvas=document.createElement('canvas');canvas.width=publicImage.naturalWidth;canvas.height=publicImage.naturalHeight;
  const context=canvas.getContext('2d');let captured;
  function draw(){context.drawImage(publicImage,0,0);if(!captured||captured.getVideoTracks()[0].readyState==='live')requestAnimationFrame(draw);}
  draw();captured=canvas.captureStream(30);return captured;
};
navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',deviceId:'qa-fixture',label:'PUBLIC FIXTURE — NOT A CAMERA'}];
const note=document.createElement('div');note.textContent=synthetic?'LOCAL QA: SYNTHETIC HORIZONTAL POSE, NOT MODEL PREDICTIONS OR A REAL FALL':'LOCAL QA: PUBLIC IMAGE STREAM, NOT LIVE CAMERA FOOTAGE';
note.style.cssText='padding:10px;background:#ffd447;color:#171717;text-align:center;font-weight:bold;';document.body.prepend(note);

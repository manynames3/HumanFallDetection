import {calibration} from './calibration.js';
import {warningKind,displayState,displayLabel} from './decision.js';
import {fullscreenSupport,isFullscreen,toggleFullscreen} from './ui.js';
const $=id=>document.getElementById(id);
const video=$('video'),canvas=$('overlay'),ctx=canvas.getContext('2d');
const COLORS={'monitoring':'#5cc4b8','evaluating':'#ffc14a','possible-fall':'#ff5a6e','warming-up':'#aebbd0','unavailable':'#aebbd0'};
const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32],[7,8],[0,7],[0,8]];
let stream=null,worker=null,epoch=0,running=false,busy=false,people=[],frameSize=[640,480],lastResult=0,lastSent=0,lastVideo=-1;
let audio=null,watchdog=null,animation=null,readyReject=null,frameTimes=[],alerted=new Set(),lastTone=0;
const room=calibration(canvas,(zones,editing)=>{worker?.postMessage({type:'zones',zones,enabled:!editing});people=[];},()=>frameSize);
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
// Tones (styled in style.css): idle, busy, active, ok, watch, alert, error. Text always carries the state too.
function status(text,tone='idle'){$('status-text').textContent=text;$('status').dataset.tone=tone;}
function setSession(on){$('start').hidden=on;$('start').disabled=on;$('stop').hidden=!on;$('stop').disabled=!on;}
function fail(text,label='Camera stopped'){stop(text);message(text,true);status(label,'error');}
function syncFullscreen(){const button=$('fullscreen'),on=isFullscreen(document,$('viewer')),label=on?'Exit full screen':'Enter full screen';button.hidden=!(fullscreenSupport(document,$('viewer'))&&$('stage').classList.contains('active'));button.setAttribute('aria-label',label);button.title=label;}
function clearOverlay(){ctx.clearRect(0,0,canvas.width,canvas.height);people=[];$('people').textContent='0 people tracked';}
function ensureAudio(){audio??=new(window.AudioContext||window.webkitAudioContext)();return audio.resume();}
function tone(){if(!audio||audio.state!=='running')return;for(let i=0;i<3;i++){const oscillator=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+i*.25;oscillator.frequency.value=780;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.15,at+.02);gain.gain.linearRampToValueAtTime(0,at+.18);oscillator.connect(gain).connect(audio.destination);oscillator.start(at);oscillator.stop(at+.2);}}
function stop(reason='Camera stopped. Nothing was recorded.') {
  const refocus=document.activeElement===$('stop');
  epoch++;running=false;busy=false;
  if(readyReject){readyReject(new Error('Session cancelled'));readyReject=null;}
  worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;
  room.setActive(false);$('diagnostics').textContent='Not monitoring. Room calibration cleared.';
  $('alert').hidden=true;
  video.pause();video.srcObject=null;clearInterval(watchdog);cancelAnimationFrame(animation);
  clearOverlay();$('stage').classList.remove('active');$('stage').style.removeProperty('--video-ratio');$('empty').hidden=false;
  if(isFullscreen(document,$('viewer')))toggleFullscreen(document,$('viewer')).then(syncFullscreen);
  setSession(false);$('camera').disabled=false;syncFullscreen();
  $('fps').textContent='— FPS';$('coverage').textContent='Not monitoring';status('Camera is off');message(reason);
  if(refocus)$('start').focus();
}
function draw() {
  if(!running)return;
  const rect=$('stage').getBoundingClientRect();
  const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.clearRect(0,0,w,h);
  if(performance.now()-lastResult<700){
    const scale=Math.min(w/frameSize[0],h/frameSize[1]),ox=(w-frameSize[0]*scale)/2,oy=(h-frameSize[1]*scale)/2;
    const xy=p=>[ox+p.x*frameSize[0]*scale,oy+p.y*frameSize[1]*scale];
    for(const person of people){
      const color=COLORS[displayState(person,room.editing)];ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2*dpr;
      if($('skeleton').checked){
        for(const [a,b] of EDGES){const p=person.landmarks[a],q=person.landmarks[b];if(Math.min(p?.visibility??0,q?.visibility??0)<.5)continue;ctx.beginPath();ctx.moveTo(...xy(p));ctx.lineTo(...xy(q));ctx.stroke();}
        for(const p of person.landmarks){if((p.visibility??0)<.5)continue;ctx.beginPath();ctx.arc(...xy(p),2.5*dpr,0,Math.PI*2);ctx.fill();}
      }
      if($('boxes').checked){
        const [x1,y1,x2,y2]=person.box.map((v,i)=>(i%2?oy:ox)+v*scale);
        ctx.strokeRect(x1,y1,x2-x1,y2-y1);ctx.font=`600 ${13*dpr}px "Instrument Sans",system-ui,sans-serif`;
        const text=`#${person.id} · ${displayLabel(person,room.editing)}`,tw=ctx.measureText(text).width+12*dpr;
        const ty=Math.max(0,y1-24*dpr),tx=Math.max(0,Math.min(x1,w-tw));ctx.fillRect(tx,ty,tw,24*dpr);
        ctx.save();if($('mirror').checked){ctx.translate(tx+tw,0);ctx.scale(-1,1);ctx.fillStyle='#081213';ctx.fillText(text,6*dpr,ty+17*dpr);}else{ctx.fillStyle='#081213';ctx.fillText(text,tx+6*dpr,ty+17*dpr);}ctx.restore();ctx.fillStyle=color;
      }
    }
  }
  room.draw(ctx,w,h,...frameSize);
  animation=requestAnimationFrame(draw);
}
async function sendFrame(session){
  if(!running||session!==epoch)return;
  const now=performance.now();
  if(!busy&&now-lastSent>=1000/18&&video.readyState>=2&&video.currentTime!==lastVideo){
    busy=true;lastSent=now;lastVideo=video.currentTime;
    try{
      const bitmap=await createImageBitmap(video,{resizeWidth:640,resizeHeight:Math.round(640*video.videoHeight/video.videoWidth)});
      if(!running||epoch!==session){bitmap.close();return;}
      worker.postMessage({type:'frame',bitmap,timestamp:now},[bitmap]);
    }catch(error){if(epoch===session)fail(`Camera frame could not be read: ${error.message}`,'Camera frame error');return;}
  }
  requestAnimationFrame(()=>sendFrame(session));
}
function onResult(data){
  busy=false;lastResult=performance.now();people=data.people;frameSize=[data.width,data.height];
  frameTimes.push(lastResult);frameTimes=frameTimes.filter(t=>lastResult-t<2000);
  const fps=frameTimes.length>1?(frameTimes.length-1)*1000/(lastResult-frameTimes[0]):0;
  $('fps').textContent=`${fps.toFixed(1)} FPS`;$('people').textContent=`${people.length} ${people.length===1?'person':'people'} tracked`;
  const falls=people.filter(p=>warningKind(p,room.editing)==='fall'),down=people.filter(p=>warningKind(p,room.editing)==='down'),evaluating=people.some(p=>displayState(p,room.editing)==='evaluating'),warming=people.some(p=>displayState(p,room.editing)==='warming-up');
  const keys=[...falls.map(p=>`fall:${p.id}`),...down.map(p=>`down:${p.id}`)];
  alerted=new Set([...alerted].filter(key=>keys.includes(key)));
  $('diagnostics').replaceChildren(...people.map(p=>{
    const line=document.createElement('p');
    line.textContent=`#${p.id} · ${displayLabel(p,room.editing)}. Classifier: ${p.reason}. Raw class ${p.rawClass??'—'}, raw score ${Number.isFinite(p.rawScore)?p.rawScore.toFixed(3):'—'} (not probability). Posture: ${p.down?.posture??'unknown'}. Movement check: ${p.down?.reason??'Unavailable'}${p.down?.state!=='inactive'&&p.down?`; ${p.down.elapsed.toFixed(1)}/${p.down.required} seconds of observed down evidence`:''}.`;
    return line;
  }));
  if(!people.length)$('diagnostics').textContent=`${data.detected} pose candidate(s), none usable. Required body landmarks may be unclear; no warning evidence is available.`;
  $('coverage').textContent=fps>0&&fps<10?'Low analysis rate':`${Math.round(data.inferenceMs)} ms analysis`;
  if(performance.now()-data.timestamp>1000){clearOverlay();status('Analysis delayed','watch');$('coverage').textContent='Not current';$('diagnostics').textContent='Analysis delayed; current warning evidence is unavailable.';return;}
  if(falls.length||down.length){
    const title=falls.length?'Possible fall detected':'Person may be down—check on them';
    status(title,'alert');
    const newFall=keys.some(key=>!alerted.has(key));keys.forEach(key=>alerted.add(key));
    if(newFall){$('alert-title').textContent=title;$('alert-description').textContent=falls.length?(falls.some(p=>p.down?.state==='possible-fall')?'A rapid standing/sitting-to-down transition was followed by 2 seconds of observed down posture. Check on the person; impact and floor contact are not confirmed.':'Model warning. Check on the person; this is not a confirmed emergency.'):'A down posture persisted for 8 seconds of observed evidence. This may also be intentional lying, including on furniture. Check on the person; a fall is not confirmed.';$('alert').hidden=false;}
    if(newFall&&$('sound').checked&&lastResult-lastTone>10000){tone();lastTone=lastResult;}
  }else if(evaluating)status('Evaluating movement','watch');
  else if(warming)status('Learning movement','busy');
  else if(people.some(p=>displayState(p,room.editing)==='monitoring')){
    const label=people.length===1?displayLabel(people[0],room.editing):'';
    status(fps<10?'Tracking · low analysis rate':people.length!==1?'Tracking movement':label==='Tracking'?label:`Tracking · ${label}`,fps<10?'watch':'ok');
  }
  else status(data.detected?'Whole body not clear':'No person in view','active');
}
async function start(){
  const session=++epoch,refocus=document.activeElement===$('start');
  setSession(true);$('camera').disabled=true;$('alert').hidden=true;if(refocus)$('stop').focus();
  alerted=new Set();lastTone=-Infinity;frameTimes=[];lastVideo=-1;lastSent=0;
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires HTTPS and a supported browser.');
    ensureAudio().catch(()=>{});
    status('Waiting for camera permission','busy');message('Allow camera access in your browser. Audio is never captured.');
    const choice=$('camera').value;
    const capture=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(choice==='user'||choice==='environment'?{facingMode:{ideal:choice}}:{deviceId:{exact:choice}}),width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}}});
    if(session!==epoch){capture.getTracks().forEach(t=>t.stop());return;}
    stream=capture;video.srcObject=stream;await video.play();
    if(session!==epoch)return;
    const track=stream.getVideoTracks()[0];track.addEventListener('ended',()=>{if(session===epoch)stop('Camera disconnected. Reconnect it and start again.');});
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    if(session!==epoch)return;
    if(devices.length){
      $('camera').replaceChildren(...devices.map((d,i)=>new Option(d.label||`Camera ${i+1}`,d.deviceId)));
      const active=track.getSettings().deviceId;
      $('camera').value=devices.some(d=>d.deviceId===active)?active:devices[0].deviceId;
    }
    // Match the stage to the camera's aspect ratio so the video is not letterboxed; drawing still uses contain-fit math.
    if(video.videoWidth&&video.videoHeight)$('stage').style.setProperty('--video-ratio',`${video.videoWidth} / ${video.videoHeight}`);
    $('stage').classList.add('active');$('empty').hidden=true;syncFullscreen();
    status('Preparing detection','busy');message('Preparing on-device detection. The first start may take a moment.');
    worker=new Worker('./worker.js?v=4');
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Detector loading timed out. Check your connection and try again.')),90000);
      const finish=(fn,value)=>{clearTimeout(timeout);readyReject=null;fn(value);};
      readyReject=error=>finish(reject,error);
      worker.onmessage=({data})=>{
        if(session!==epoch)return;
        if(data.type==='ready')finish(resolve);
        else if(data.type==='result')onResult(data);
        else if(data.type==='error'){if(!running)finish(reject,new Error(data.message));else fail('Detector stopped unexpectedly. Restart the camera session.','Detector stopped');}
      };
      worker.onerror=()=>{if(session!==epoch)return;if(!running)finish(reject,new Error('Detector could not start in this browser. Try current Chrome or Safari.'));else fail('Detector stopped unexpectedly. Restart the camera session.','Detector stopped');};
      worker.postMessage({type:'load'});
    });
    if(session!==epoch)return;
    running=true;lastResult=performance.now();$('camera').disabled=false;
    frameSize=[640,Math.round(640*video.videoHeight/video.videoWidth)];room.setActive(true);
    message('Camera active. Detection is automatic; room tuning is optional. Keep this page visible.');
    status('Looking for a person','active');sendFrame(session);draw();
    watchdog=setInterval(()=>{if(running&&performance.now()-lastResult>4000)fail('No recent analysis. The camera session stopped; try again.','Analysis stopped');},500);
  }catch(error){
    if(session!==epoch)return;
    const messages={NotAllowedError:'Camera permission was denied. Allow camera access in your browser’s site settings, then retry.',NotFoundError:'No camera found. Connect your webcam or try a device with a camera.',NotReadableError:'The camera is unavailable or in use by another app. Close that app and retry.',OverconstrainedError:'The selected camera is no longer available. Refresh and select another camera.'};
    fail(messages[error.name]||error.message,'Camera unavailable');
  }
}
$('start').addEventListener('click',start);$('stop').addEventListener('click',()=>stop());
$('fullscreen').addEventListener('click',async()=>{if(await toggleFullscreen(document,$('viewer'))==='failed')message('Full screen is not available here.',true);syncFullscreen();});
['fullscreenchange','webkitfullscreenchange'].forEach(type=>document.addEventListener(type,syncFullscreen));
$('camera').addEventListener('change',()=>{if(running){stop('Switching cameras…');start();}});
$('mirror').addEventListener('change',()=>$('stage').classList.toggle('mirrored',$('mirror').checked));
$('sound').addEventListener('change',()=>{if($('sound').checked)ensureAudio().catch(()=>message('Sound unavailable. Try Test sound again.',true));});
$('test-sound').addEventListener('click',async()=>{try{await ensureAudio();tone();message('Test sound played on this device. Check that you can hear it.');}catch{message('Sound unavailable in this browser.',true);}});
$('dismiss').addEventListener('click',()=>$('alert').hidden=true);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||$('start').disabled))stop('Session stopped because the page was hidden. Start again when ready.');});
window.addEventListener('pagehide',()=>stop());
video.addEventListener('resize',()=>{if(running&&Math.abs(video.videoWidth/video.videoHeight-frameSize[0]/frameSize[1])>.01)stop('Camera framing changed. Start again; redraw any optional regions you use.');});

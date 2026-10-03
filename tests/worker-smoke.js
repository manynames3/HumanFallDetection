const button=document.getElementById('run'),output=document.getElementById('result');
button.onclick=()=>{
  button.disabled=true;output.textContent='Loading actual browser worker…';
  const worker=new Worker('../browser/worker.js?v=2');let frames=0;
  const timeout=setTimeout(()=>{output.textContent='FAIL: worker timeout';worker.terminate();button.disabled=false;},60000);
  worker.onerror=error=>{output.textContent=`FAIL: ${error.message} at ${error.filename}:${error.lineno}`;clearTimeout(timeout);worker.terminate();button.disabled=false;};
  worker.onmessage=async({data})=>{
    if(data.type==='error'){output.textContent=`FAIL: ${data.message}`;clearTimeout(timeout);worker.terminate();button.disabled=false;return;}
    if(data.type==='result'){
      frames++;output.textContent=JSON.stringify({frames,detected:data.detected,people:data.people.map(p=>({id:p.id,state:p.state,samples:p.samples})),inferenceMs:data.inferenceMs},null,2);
      if(!data.detected||!data.people.length){output.textContent='FAIL: no qualified pose';clearTimeout(timeout);worker.terminate();button.disabled=false;return;}
      if(frames===40){output.textContent='PASS: actual MediaPipe worker + original LSTM, 40 recurrent frames\n'+output.textContent;clearTimeout(timeout);worker.terminate();button.disabled=false;return;}
    }
    if(data.type==='ready'||data.type==='result'){
      const image=document.getElementById('fixture');await image.decode();
      const bitmap=await createImageBitmap(image);worker.postMessage({type:'frame',bitmap,timestamp:1000+frames*1000/18},[bitmap]);
    }
  };
  worker.postMessage({type:'load'});
};

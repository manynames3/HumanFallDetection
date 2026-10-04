import {validPolygon} from './person-down.js';
const $=id=>document.getElementById(id),names={floor:'Floor',bed:'Bed exclusion',sofa:'Sofa exclusion'};
export function calibration(canvas,onChange,getFrameSize) {
  let zones=[],points=[],editing=false,active=false,kind='floor';
  const sync=()=>{
    $('zone-start').disabled=!active||editing||zones.length>=12;
    $('zone-save').disabled=!editing||points.length<3;
    $('zone-undo').disabled=!editing||!points.length;
    $('zone-cancel').disabled=!editing;
    $('zone-clear').disabled=!zones.length&&!editing;
    canvas.classList.toggle('editing',editing);
    $('zone-message').textContent=editing?`Tap corners around ${names[kind].toLowerCase()} in the camera image (${points.length} points), then Save region. New movement/posture warnings are paused while drawing.`:!active?'Start the camera. Room marking is optional.':zones.length?'Optional regions applied. Excluded furniture suppresses warnings when the torso overlaps it. Redraw after moving the camera.':'Automatic movement and down-posture checks are on. No room marking required. Add furniture exclusions only if needed.';
    $('zone-list').replaceChildren(...zones.map((z,i)=>{
      const li=document.createElement('li'),button=document.createElement('button');
      button.className='text-button';button.textContent=`Remove ${names[z.kind]} ${i+1}`;
      button.addEventListener('click',()=>{zones.splice(i,1);notify();sync();});li.append(button);return li;
    }));
  };
  const notify=()=>onChange(zones,editing);
  $('zone-start').addEventListener('click',()=>{editing=true;points=[];kind=$('zone-kind').value;notify();sync();$('stage').scrollIntoView({block:'center',behavior:'instant'});});
  $('zone-save').addEventListener('click',()=>{
    if(!validPolygon(points)){$('zone-message').textContent='Use at least 3 distinct corners enclosing an area, without crossing edges. Undo a point or Cancel to retry.';return;}
    zones.push({kind,points});points=[];editing=false;notify();sync();
  });
  $('zone-undo').addEventListener('click',()=>{points.pop();sync();});
  $('zone-cancel').addEventListener('click',()=>{editing=false;points=[];notify();sync();});
  $('zone-clear').addEventListener('click',()=>{zones=[];points=[];editing=false;notify();sync();});
  canvas.addEventListener('pointerdown',event=>{
    if(!editing)return;
    const rect=canvas.getBoundingClientRect(),[fw,fh]=getFrameSize(),scale=Math.min(rect.width/fw,rect.height/fh);
    let px=event.clientX-rect.left;if($('mirror').checked)px=rect.width-px;
    const x=(px-(rect.width-fw*scale)/2)/(fw*scale),y=(event.clientY-rect.top-(rect.height-fh*scale)/2)/(fh*scale);
    if(x<0||x>1||y<0||y>1)return;
    if(points.length>=20){$('zone-message').textContent='Maximum 20 corners. Save or Undo.';return;}
    points.push([x,y]);sync();
  });
  sync();
  return {
    get editing(){return editing;},
    setActive(value){active=value;if(!value){zones=[];points=[];editing=false;notify();}sync();},
    draw(ctx,w,h,fw,fh){
      const scale=Math.min(w/fw,h/fh),ox=(w-fw*scale)/2,oy=(h-fh*scale)/2;
      for(const z of [...zones,...(editing?[{kind,points}]:[])]){
        if(!z.points.length)continue;
        ctx.save();ctx.strokeStyle=z.kind==='floor'?'#75baff':'#ffc14a';ctx.fillStyle=z.kind==='floor'?'#75baff20':'#ffc14a25';ctx.lineWidth=2;
        ctx.beginPath();z.points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](ox+p[0]*fw*scale,oy+p[1]*fh*scale));
        if(z.points.length>=3){ctx.closePath();ctx.fill();}ctx.stroke();
        for(const p of z.points){ctx.beginPath();ctx.arc(ox+p[0]*fw*scale,oy+p[1]*fh*scale,4,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();}
        ctx.restore();
      }
    }
  };
}

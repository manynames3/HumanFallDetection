// Offline research candidate. Anchored continuation of model-estimated cropped torsos.
// Off-frame coordinates remain estimates; this is not verified joint visibility.
const confidence=p=>Math.min(p?.visibility??0,p?.presence??1);
const trusted=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&confidence(p)>=.5;
const visible=p=>trusted(p)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const center=(lm,a,b)=>[(lm[a].x+lm[b].x)/2,(lm[a].y+lm[b].y)/2];
export function segmentInsideFraction(a,b){
  if(![...a,...b].every(Number.isFinite))return 0;
  let lo=0,hi=1;
  for(let k=0;k<2;k++){
    const d=b[k]-a[k];
    if(Math.abs(d)<1e-12){if(a[k]<0||a[k]>1)return 0;continue;}
    const x=-a[k]/d,y=(1-a[k])/d;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));
  }
  return Math.max(0,hi-lo);
}
const overlap=(a,b)=>{
  const area=r=>Math.max(0,r[2]-r[0])*Math.max(0,r[3]-r[1]);
  const i=area([Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])]);
  return i/Math.max(1e-8,area(a)+area(b)-i);
};
function describe(lm,w,h,mode){
  if(![11,12,23,24].every(i=>trusted(lm[i])))return null;
  const cropped=![11,12,23,24].every(i=>visible(lm[i]));
  const hip=center(lm,23,24),shoulder=center(lm,11,12);
  if(cropped&&(mode==='strict'||segmentInsideFraction(shoulder,hip)+1e-9<.5))return null;
  const length=Math.hypot((hip[0]-shoulder[0])*w,(hip[1]-shoulder[1])*h);
  if(length<h*.045)return null;
  const points=lm.filter(visible);if(!points.length)return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {lm,hip,shoulder,cropped,box:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],quality:points.reduce((s,p)=>s+confidence(p),0)/33};
}
export class PoseTrackerV6 {
  constructor({mode='anchored'}={}){if(!['strict','anchored','unanchored'].includes(mode))throw new Error('Invalid cropped-torso mode');this.mode=mode;this.reset();}
  reset(){this.tracks=[];this.nextId=1;this.time=null;this.size=null;}
  update(landmarks,time,width,height){
    if(!Number.isFinite(time)||!(width>0&&height>0))throw new Error('Invalid tracker input');
    if(this.time!==null&&(time<=this.time||time-this.time>1||this.size[0]!==width||this.size[1]!==height))this.reset();
    this.time=time;this.size=[width,height];this.tracks=this.tracks.filter(t=>time-t.time<=.5);
    const detections=[];
    for(const d of landmarks.map(lm=>describe(lm,width,height,this.mode)).filter(Boolean).sort((a,b)=>b.quality-a.quality)){
      const duplicate=detections.some(p=>{
        const shared=[11,12,23,24,25,26].filter(i=>visible(p.lm[i])&&visible(d.lm[i]));
        return shared.length>=2&&overlap(p.box,d.box)>.65&&shared.every(i=>Math.hypot(p.lm[i].x-d.lm[i].x,p.lm[i].y-d.lm[i].y)<.025);
      });
      if(!duplicate)detections.push(d);
    }
    const costs=detections.map(d=>this.tracks.map(t=>{
      if(d.cropped&&this.mode==='anchored'&&(t.anchorTime===null||time-t.anchorTime>1))return Infinity;
      const dt=time-t.time,predicted=[t.raw.hip[0]+t.velocity[0]*dt,t.raw.hip[1]+t.velocity[1]*dt];
      const scale=Math.max(.12,Math.hypot(t.raw.box[2]-t.raw.box[0],t.raw.box[3]-t.raw.box[1]));
      const distance=Math.hypot(d.hip[0]-predicted[0],d.hip[1]-predicted[1])/scale,inter=overlap(t.raw.box,d.box);
      if(distance>1.1||(distance>.65&&inter===0))return Infinity;
      return distance+.3*(1-inter)+.1*dt;
    }));
    const assign=(blockedDetection=-1,blockedTrack=-2)=>{
      let best={cost:Infinity,map:[]};
      const search=(i,used,map,cost)=>{
        if(cost>=best.cost)return;
        if(i===detections.length){best={cost,map:[...map]};return;}
        if(i!==blockedDetection||blockedTrack!==-1)search(i+1,used,[...map,-1],cost+1.1);
        for(let j=0;j<this.tracks.length;j++)if(!(i===blockedDetection&&j===blockedTrack)&&!used.has(j)&&Number.isFinite(costs[i][j])){used.add(j);search(i+1,used,[...map,j],cost+costs[i][j]);used.delete(j);}
      };
      search(0,new Set(),[],0);return best;
    };
    const best=assign(),ambiguous=detections.map(()=>false),retired=new Set();
    for(let i=0;i<detections.length;i++){
      const alternative=assign(i,best.map[i]);
      if(alternative.cost-best.cost>=.08)continue;
      for(let k=0;k<detections.length;k++)if(best.map[k]!==alternative.map[k]){
        ambiguous[k]=true;if(best.map[k]>=0)retired.add(this.tracks[best.map[k]]);if(alternative.map[k]>=0)retired.add(this.tracks[alternative.map[k]]);
      }
    }
    const assigned=new Set(best.map.filter((j,i)=>j>=0&&!ambiguous[i]));
    for(let i=0;i<detections.length;i++)if(ambiguous[i]){
      const closest=Math.min(...costs[i]);
      costs[i].forEach((cost,j)=>{if(Number.isFinite(cost)&&cost-closest<.08&&!assigned.has(j))retired.add(this.tracks[j]);});
    }
    const result=[];
    for(let i=0;i<detections.length;i++){
      const d=detections[i];let t=!ambiguous[i]&&best.map[i]>=0?this.tracks[best.map[i]]:null;
      if(!t){
        if(d.cropped&&this.mode==='anchored')continue;
        t={id:this.nextId++,time,raw:d,lm:d.lm,velocity:[0,0],anchorTime:d.cropped?null:time};this.tracks.push(t);
      }
      const dt=time-t.time,alpha=dt>0?1-Math.exp(-dt/.08):1;
      const smoothed=d.lm.map((p,j)=>{
        if(dt>.2||!visible(p)||!visible(t.lm[j]))return {...p};
        return {...p,x:t.lm[j].x+alpha*(p.x-t.lm[j].x),y:t.lm[j].y+alpha*(p.y-t.lm[j].y)};
      });
      if(dt>0)for(let j=0;j<2;j++)t.velocity[j]=.5*t.velocity[j]+.5*Math.max(-2,Math.min(2,(d.hip[j]-t.raw.hip[j])/dt));
      if(!d.cropped)t.anchorTime=time;
      t.time=time;t.raw=d;t.lm=smoothed;result.push({id:t.id,landmarks:smoothed,rawLandmarks:d.lm,observed:true,cropped:d.cropped});
    }
    this.tracks=this.tracks.filter(t=>!retired.has(t));return result;
  }
}

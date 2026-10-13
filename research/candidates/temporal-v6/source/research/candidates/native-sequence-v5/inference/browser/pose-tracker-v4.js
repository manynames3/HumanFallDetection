// Candidate tracker. No appearance IDs, stale-coordinate output or cross-camera identity.
const confidence=p=>Math.min(p?.visibility??0,p?.presence??1);
const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&confidence(p)>=.5;
const center=(lm,a,b)=>[(lm[a].x+lm[b].x)/2,(lm[a].y+lm[b].y)/2];
const overlap=(a,b)=>{
  const area=r=>Math.max(0,r[2]-r[0])*Math.max(0,r[3]-r[1]);
  const i=area([Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])]);
  return i/Math.max(1e-8,area(a)+area(b)-i);
};
function describe(lm,w,h){
  if(![11,12,23,24].every(i=>visible(lm[i])))return null;
  const hip=center(lm,23,24),shoulder=center(lm,11,12),length=Math.hypot((hip[0]-shoulder[0])*w,(hip[1]-shoulder[1])*h);
  if(length<h*.045)return null;
  const points=lm.filter(visible),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {lm,hip,shoulder,box:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],quality:points.reduce((s,p)=>s+confidence(p),0)/33};
}
export class PoseTracker {
  constructor(){this.reset();}
  reset(){this.tracks=[];this.nextId=1;this.time=null;this.size=null;}
  update(landmarks,time,width,height){
    if(!Number.isFinite(time)||!(width>0&&height>0))throw new Error('Invalid tracker input');
    if(this.time!==null&&(time<=this.time||time-this.time>1||this.size[0]!==width||this.size[1]!==height))this.reset();
    this.time=time;this.size=[width,height];this.tracks=this.tracks.filter(t=>time-t.time<=.5);
    const detections=[];
    for(const d of landmarks.map(lm=>describe(lm,width,height)).filter(Boolean).sort((a,b)=>b.quality-a.quality)){
      // Suppress only nearly identical skeletons, not simply overlapping people.
      const duplicate=detections.some(p=>overlap(p.box,d.box)>.65&&[11,12,23,24,25,26].filter(i=>visible(p.lm[i])&&visible(d.lm[i])).every(i=>Math.hypot(p.lm[i].x-d.lm[i].x,p.lm[i].y-d.lm[i].y)<.025));
      if(!duplicate)detections.push(d);
    }
    const costs=detections.map(d=>this.tracks.map(t=>{
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
    // Compare complete one-to-one assignments, not an independently tied cost row.
    for(let i=0;i<detections.length;i++){
      const alternative=assign(i,best.map[i]);
      if(alternative.cost-best.cost>=.08)continue;
      for(let k=0;k<detections.length;k++)if(best.map[k]!==alternative.map[k]){
        ambiguous[k]=true;
        if(best.map[k]>=0)retired.add(this.tracks[best.map[k]]);
        if(alternative.map[k]>=0)retired.add(this.tracks[alternative.map[k]]);
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
      if(!t){t={id:this.nextId++,time,raw:d,lm:d.lm,velocity:[0,0]};this.tracks.push(t);}
      const dt=time-t.time,alpha=dt>0?1-Math.exp(-dt/.08):1;
      const smoothed=d.lm.map((p,j)=>{
        if(dt>.2||!visible(p)||!visible(t.lm[j]))return {...p};
        return {...p,x:t.lm[j].x+alpha*(p.x-t.lm[j].x),y:t.lm[j].y+alpha*(p.y-t.lm[j].y)};
      });
      if(dt>0)for(let j=0;j<2;j++)t.velocity[j]=.5*t.velocity[j]+.5*Math.max(-2,Math.min(2,(d.hip[j]-t.raw.hip[j])/dt));
      t.time=time;t.raw=d;t.lm=smoothed;result.push({id:t.id,landmarks:smoothed,rawLandmarks:d.lm,observed:true});
    }
    // A deliberately abandoned history must not compete against its fresh replacement.
    this.tracks=this.tracks.filter(t=>!retired.has(t));
    return result;
  }
}

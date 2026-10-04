// DECISION: Keep unvalidated movement/posture rules separate from the MIT model.
// No mandatory zones. 2D geometry cannot establish impact or floor contact.
export function validPolygon(points) {
  if (!Array.isArray(points) || points.length<3 || points.length>20 || points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))) return false;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    if(j===i+1||(i===0&&j===points.length-1))continue;
    const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
    if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return false;
  }
  const area=Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
  return area>.005;
}
export function inside(point,polygon) {
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
    if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)hit=!hit;
  }
  return hit;
}
const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&Math.min(p.visibility??0,p.presence??1)>=.55;
const angleFromVertical=(a,b,w,h)=>Math.atan2(Math.abs((a[0]-b[0])*w),Math.abs((a[1]-b[1])*h))*180/Math.PI;
const distance=(a,b,w,h)=>Math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h);
export function floorEvidence(person,zones,width,height) {
  const lm=person.landmarks;
  const unknown=reason=>({eligible:false,posture:'unknown',reason});
  if(!lm || ![11,12,23,24].every(i=>visible(lm[i])))return unknown('Shoulders and hips must be visible');
  const midpoint=(a,b)=>[(lm[a].x+lm[b].x)/2,(lm[a].y+lm[b].y)/2];
  const shoulder=midpoint(11,12),hip=midpoint(23,24),torso=[(shoulder[0]+hip[0])/2,(shoulder[1]+hip[1])/2];
  if(zones.some(z=>z.kind!=='floor'&&[shoulder,hip,torso].some(p=>inside(p,z.points))))return {eligible:false,posture:'excluded',reason:'Bed/sofa exclusion overlaps torso'};
  const length=distance(shoulder,hip,width,height);
  if(length<height*.045)return unknown('Body too small or torso geometry unclear');
  const chains=[[23,25,27],[24,26,28]].filter(side=>side.every(i=>visible(lm[i])));
  if(!chains.length)return unknown('At least one complete hip/knee/ankle chain must be visible');
  const angle=angleFromVertical(shoulder,hip,width,height);
  const body=[shoulder,hip,...chains.flatMap(side=>side.slice(1).map(i=>[lm[i].x,lm[i].y]))];
  const bodyHeight=(Math.max(...body.map(p=>p[1]))-Math.min(...body.map(p=>p[1])))*height;
  const legs=chains.map(([hi,ki,ai])=>{
    const a=[lm[hi].x,lm[hi].y],b=[lm[ki].x,lm[ki].y],c=[lm[ai].x,lm[ai].y];
    const upper=distance(a,b,width,height),lower=distance(b,c,width,height);
    const u=[(a[0]-b[0])*width,(a[1]-b[1])*height],v=[(c[0]-b[0])*width,(c[1]-b[1])*height];
    const kneeAngle=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(upper*lower))))*180/Math.PI;
    return {upper,lower,kneeAngle,axis:angleFromVertical(a,c,width,height),lowerAngle:angleFromVertical(b,c,width,height),ankle:c,knee:b};
  });
  if(legs.some(l=>l.upper<length*.2||l.lower<length*.2||l.upper>length*3||l.lower>length*3||!Number.isFinite(l.kneeAngle)))return unknown('Leg proportions unclear');
  const details={angle,hipY:hip[1]*height,bodyHeight,torsoLength:length};
  const uprightLegs=legs.every(l=>l.lowerAngle<35&&(l.ankle[1]-hip[1])*height>length*.6);
  if(angle<35&&uprightLegs&&legs.every(l=>l.kneeAngle>150&&l.axis<35))return {...details,eligible:false,posture:'standing',reason:'Upright torso and extended supporting legs'};
  if(angle<55&&uprightLegs&&legs.some(l=>l.kneeAngle<145))return {...details,eligible:false,posture:'sitting',reason:'Upright torso with bent knees and supporting lower legs'};
  // A bent torso alone is not enough: legs must also support a down posture.
  const extendedDown=angle>=60&&legs.some(l=>l.axis>=45&&l.lowerAngle>=45)&&!uprightLegs&&bodyHeight<length*1.5;
  const curledDown=angle>=70&&bodyHeight<length*.95&&legs.every(l=>distance(hip,l.ankle,width,height)<length*1.5);
  const down=extendedDown||curledDown;
  if(!down)return {...details,eligible:false,posture:'other',reason:'Not a consistent down posture (torso plus legs required)'};
  const floors=zones.filter(z=>z.kind==='floor');
  if(floors.length&&!floors.some(z=>inside(torso,z.points)&&inside(hip,z.points)&&legs.some(l=>inside(l.knee,z.points)||inside(l.ankle,z.points))))return {...details,eligible:false,posture:'excluded',reason:'Body is outside the optional floor region'};
  return {...details,eligible:true,posture:'lying',reason:floors.length?'Down posture in marked floor region':'Down posture; floor contact is not established'};
}
export class PersonDownMonitor {
  constructor(){this.configure([]);}
  configure(zones){this.zones=zones.filter(z=>['floor','bed','sofa'].includes(z.kind)&&validPolygon(z.points)).map(z=>({kind:z.kind,points:z.points.map(p=>[...p])}));this.tracks=new Map();this.lastTime=null;}
  update(people,time,width,height){
    if(this.lastTime!==null&&(time<=this.lastTime||time-this.lastTime>1))this.tracks.clear();
    this.lastTime=time;
    const present=new Set(people.map(p=>p.id));
    for(const [id,t] of this.tracks){
      if(time-t.time>.75)this.tracks.delete(id);
      else if(!present.has(id))t.positive=false;
    }
    return people.map(person=>{
      const evidence=floorEvidence(person,this.zones,width,height);
      const t=this.tracks.get(person.id)??{time,elapsed:0,positive:false,lastPositive:null,recovery:null,baseline:[],transition:false};
      const dt=Math.max(0,time-t.time);
      t.baseline=t.baseline.filter(p=>time-p.time<=3);
      if(evidence.posture==='excluded'){t.elapsed=0;t.transition=false;t.baseline=[];t.lastPositive=null;}
      else if(evidence.eligible){
        if(t.lastPositive===null||time-t.lastPositive>.75){
          t.elapsed=0;t.transition=false;
          const refs=t.baseline.filter(p=>time-p.time<=1.5);
          if(refs.length>=4&&refs.at(-1).time-refs[0].time>=.6){
            const median=key=>refs.map(p=>p[key]).sort((a,b)=>a-b)[Math.floor(refs.length/2)];
            t.transition=evidence.hipY-median('hipY')>median('torsoLength')*.35&&evidence.bodyHeight<median('bodyHeight')*.65&&evidence.angle-median('angle')>35;
          }
        }
        if(t.positive&&dt<=.5)t.elapsed+=dt;
        t.lastPositive=time;t.recovery=null;
      }else{
        if(['standing','sitting'].includes(evidence.posture)){
          t.recovery??=time;t.baseline.push({...evidence,time});
          if(time-t.recovery>=1){t.elapsed=0;t.transition=false;t.lastPositive=null;}
        }else t.recovery=null;
        if(t.lastPositive!==null&&time-t.lastPositive>.75){t.elapsed=0;t.transition=false;t.lastPositive=null;}
      }
      t.time=time;t.positive=evidence.eligible;this.tracks.set(person.id,t);
      const required=t.transition?2:8;
      const held=t.lastPositive!==null&&time-t.lastPositive<=.75;
      const state=held?(t.elapsed+1e-8>=required?(t.transition?'possible-fall':'person-down'):'down-evaluating'):'inactive';
      const down={...evidence,elapsed:t.elapsed,required,state,source:t.transition?'movement-transition':'sustained-posture',reason:t.transition?'Rapid standing/sitting-to-down transition; impact not established':evidence.reason};
      return {...person,down};
    });
  }
}

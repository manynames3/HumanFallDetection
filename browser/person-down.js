// DECISION: Separate experimental floor-posture warnings from the retained
// MIT fall classifier. A down posture is not proof that a fall occurred.
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
const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&Math.min(p.visibility??0,p.presence??1)>=.6;
export function floorEvidence(person,zones,width,height) {
  if(!zones.some(z=>z.kind==='floor'))return {eligible:false,reason:'Mark a floor region to enable person-down checks'};
  const lm=person.landmarks;
  if(!lm || ![11,12,23,24].every(i=>visible(lm[i])) || ![[25,27],[26,28]].some(side=>side.every(i=>visible(lm[i]))))return {eligible:false,reason:'Torso and at least one knee/ankle must be visible'};
  const midpoint=(a,b)=>[(lm[a].x+lm[b].x)/2,(lm[a].y+lm[b].y)/2];
  const shoulder=midpoint(11,12),hip=midpoint(23,24),torso=[(shoulder[0]+hip[0])/2,(shoulder[1]+hip[1])/2];
  const length=Math.hypot((shoulder[0]-hip[0])*width,(shoulder[1]-hip[1])*height);
  if(length<height*.06)return {eligible:false,reason:'Body too small or torso geometry unclear'};
  const angle=Math.atan2(Math.abs((shoulder[0]-hip[0])*width),Math.abs((shoulder[1]-hip[1])*height))*180/Math.PI;
  if(zones.some(z=>z.kind!=='floor'&&[shoulder,hip,torso].some(p=>inside(p,z.points))))return {eligible:false,reason:'Bed/sofa exclusion overlaps torso',angle};
  if(angle<60)return {eligible:false,reason:'Torso is not sufficiently horizontal',angle};
  const support=[25,26,27,28].filter(i=>visible(lm[i])).map(i=>[lm[i].x,lm[i].y]);
  if(!zones.some(z=>z.kind==='floor'&&inside(torso,z.points)&&inside(hip,z.points)&&support.some(p=>inside(p,z.points))))return {eligible:false,reason:'Body is outside the marked floor region',angle};
  return {eligible:true,reason:'Horizontal body in marked floor region',angle};
}
export class PersonDownMonitor {
  constructor(){this.configure([]);}
  configure(zones){this.zones=zones.filter(z=>['floor','bed','sofa'].includes(z.kind)&&validPolygon(z.points)).map(z=>({kind:z.kind,points:z.points.map(p=>[...p])}));this.tracks=new Map();}
  update(people,time,width,height){
    const present=new Set(people.map(p=>p.id));
    for(const id of this.tracks.keys())if(!present.has(id))this.tracks.delete(id);
    return people.map(person=>{
      const evidence=floorEvidence(person,this.zones,width,height),last=this.tracks.get(person.id);
      const continuous=last&&time>last.time&&time-last.time<=.5;
      const since=evidence.eligible?(continuous&&last.since!==null?last.since:time):null;
      const elapsed=since===null?0:time-since;
      this.tracks.set(person.id,{time,since});
      const down={...evidence,elapsed,required:8,state:evidence.eligible?(elapsed>=8?'person-down':'down-evaluating'):'inactive'};
      return {...person,down};
    });
  }
}

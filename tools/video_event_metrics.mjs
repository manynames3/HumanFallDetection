// Continuous event scoring: an already-running warning is not a new detected fall.
export function alertEpisodes(times,silenceSeconds=5){
  if(!Number.isFinite(silenceSeconds)||silenceSeconds<0)throw new Error('Invalid alert silence');
  const sorted=[...new Set(times)].sort((a,b)=>a-b),episodes=[];
  for(const t of sorted){
    if(!Number.isFinite(t)||t<0)throw new Error('Invalid alert clock');
    const last=episodes.at(-1);
    if(!last||t-last.end>silenceSeconds)episodes.push({start:t,end:t,times:[t]});else{last.end=t;last.times.push(t);}
  }
  return episodes;
}
export function continuousMetrics(times,{events,normalIntervals,duration},{silenceSeconds=5,graceSeconds=3,samplingHz=18}={}){
  if(normalIntervals.some(([a,b])=>!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a||b>duration+1e-6))throw new Error('Invalid normal exposure');
  const episodes=alertEpisodes(times,silenceSeconds),used=new Set(),detections=[];
  for(const e of events){
    const j=episodes.findIndex((p,i)=>!used.has(i)&&p.start>=e.start&&p.start<=Math.min(duration,e.processEnd+graceSeconds));
    if(j>=0)used.add(j);
    detections.push({id:e.id,start:e.start,processEnd:e.processEnd,detected:j>=0,warningAt:j>=0?episodes[j].start:null,latency:j>=0?episodes[j].start-e.start:null,duringProcess:j>=0&&episodes[j].start<=e.processEnd});
  }
  const normal=t=>normalIntervals.some(([a,b])=>t>=a&&t<b);
  const falseEpisodes=episodes.filter(e=>e.times.some(normal));
  const normalSeconds=normalIntervals.reduce((a,[start,end])=>a+end-start,0),normalWarningSeconds=[...new Set(times)].filter(normal).length/samplingHz;
  return {events:events.length,detected: detections.filter(d=>d.detected).length,missed:detections.filter(d=>!d.detected).length,duringProcess:detections.filter(d=>d.duringProcess).length,falseEpisodes:falseEpisodes.length,normalSeconds,normalWarningSeconds,alertEpisodes:episodes.length,detections,falseEpisodeStarts:falseEpisodes.map(e=>e.start),unmatchedEpisodeStarts:episodes.filter((e,i)=>!used.has(i)).map(e=>e.start)};
}

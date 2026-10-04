// Synthetic geometry regressions: these are not camera/model accuracy tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonDownMonitor} from '../browser/person-down.js';
import {poseFromLandmarks} from '../browser/features.js';
import {Detector} from '../browser/detector.js';
import {readFileSync} from 'node:fs';
import {warningKind,displayLabel} from '../browser/decision.js';

function person(posture='down',id=1) {
  const landmarks=Array.from({length:33},()=>({x:.5,y:.12,visibility:.9,presence:.9}));
  const joints={
    standing:[[.5,.27],[.5,.5],[.5,.7],[.5,.9]],
    sitting:[[.5,.32],[.5,.55],[.7,.58],[.7,.85]],
    bending:[[.3,.5],[.5,.55],[.5,.72],[.5,.9]],
    down:[[.28,.7],[.53,.75],[.7,.77],[.87,.8]],
  }[posture];
  for(const [n,pair] of [[11,12],[23,24],[25,26],[27,28]].entries())
    pair.forEach((i,side)=>Object.assign(landmarks[i],{x:joints[n][0]+(side? .015:-.015),y:joints[n][1]}));
  if(posture==='down')for(const i of [0,2,5,7,8])Object.assign(landmarks[i],{x:.17,y:.69});
  return {id,state:'monitoring',landmarks};
}
function run(m,p,from,to,hz=10) {
  let result;
  for(let i=0;i<=Math.round((to-from)*hz);i++)result=m.update([p],from+i/hz,640,480)[0];
  return result;
}
test('No zones required: an already-down body produces a cautious warning',()=>{
  const m=new PersonDownMonitor();
  assert.equal(run(m,person(),0,7.5).down.state,'down-evaluating');
  assert.equal(run(m,person(),7.6,8.2).down.state,'person-down');
});
test('Standing and sitting to rapid sustained down produce transition warnings',()=>{
  for(const start of ['standing','sitting']) {
    const m=new PersonDownMonitor();run(m,person(start),0,2);
    const first=m.update([person()],2.1,640,480)[0];
    assert.equal(first.down.state,'down-evaluating');
    const warning=run(m,person(),2.2,4.4);
    assert.equal(warning.down.state,'possible-fall');
    assert.equal(warning.down.source,'movement-transition');
  }
});
test('Standing, sitting and bending never qualify as a sustained down posture',()=>{
  for(const posture of ['standing','sitting','bending']) {
    const m=new PersonDownMonitor();const p=run(m,person(posture),0,12);
    assert.equal(p.down.state,'inactive');
    if(posture!=='bending')assert.equal(p.down.posture,posture);
  }
});
test('Brief missing/unclear observations pause rather than erase down evidence',()=>{
  const m=new PersonDownMonitor();run(m,person(),0,4);
  m.update([],4.1,640,480);
  const partial=person();partial.landmarks[27].visibility=.1;partial.landmarks[28].visibility=.1;
  m.update([partial],4.2,640,480);
  const resumed=m.update([person()],4.4,640,480)[0];
  assert.ok(resumed.down.elapsed>=3.9);
  assert.ok(resumed.down.elapsed<4.2,'missing observations must not add evidence');
  assert.equal(run(m,person(),4.5,8.6).down.state,'person-down');
});
test('Long gaps, exclusion zones and sustained recovery reset evidence',()=>{
  const m=new PersonDownMonitor();run(m,person(),0,4);
  assert.equal(m.update([person()],6,640,480)[0].down.elapsed,0);
  run(m,person(),6.1,9);run(m,person('standing'),9.1,10.4);
  assert.equal(m.update([person()],10.5,640,480)[0].down.elapsed,0);
  m.configure([{kind:'sofa',points:[[.2,.6],[.65,.6],[.65,.9],[.2,.9]]}]);
  assert.equal(run(m,person(),11,22).down.state,'inactive');
});
test('A hand-sized or obscured torso cannot supply down evidence; hidden head does not block body tracking',()=>{
  const hand=person();hand.landmarks=hand.landmarks.map(p=>({...p,x:.5+(p.x-.5)*.04,y:.5+(p.y-.5)*.04}));
  assert.equal(poseFromLandmarks(hand.landmarks,640,480,0),null);
  const headHidden=person();for(const i of [0,2,5,7,8])headHidden.landmarks[i].visibility=.1;
  const tracked=poseFromLandmarks(headHidden.landmarks,640,480,0);
  assert.ok(tracked);assert.equal(tracked.classifierReady,false);
  assert.equal(run(new PersonDownMonitor(),headHidden,0,8.2).down.state,'person-down');
});
test('Real adapter, tracker, classifier and decision policy preserve a single-person collapse path',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../browser/models/lstm.json',import.meta.url)));
  const bytes=readFileSync(new URL('../browser/models/lstm.bin',import.meta.url));
  for(const hiddenHead of [false,true])for(const hz of [5,18]) {
    const detector=new Detector(manifest,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const monitor=new PersonDownMonitor();let result;
    for(let i=0;i<=hz*5;i++){
      const time=i/hz,p=person(time<=2?'standing':'down');
      if(hiddenHead&&time>2)for(const j of [0,2,5,7,8])p.landmarks[j].visibility=.1;
      const pose=poseFromLandmarks(p.landmarks,640,480,time);
      assert.ok(pose);
      result=monitor.update(detector.update([pose],time),time,640,480)[0];
      assert.equal(result.id,1,'movement should not create a new track');
    }
    assert.equal(result.down.state,'possible-fall');
    assert.equal(warningKind(result),'fall');assert.equal(displayLabel(result),'Possible fall');
  }
});
test('Curled-down bodies warn; short low-posture movements recover without a warning',()=>{
  const curled=person();for(const i of [25,26])Object.assign(curled.landmarks[i],{x:.64,y:.63});
  for(const i of [27,28])Object.assign(curled.landmarks[i],{x:.57,y:.77});
  assert.equal(run(new PersonDownMonitor(),curled,0,8.2).down.state,'person-down');
  const m=new PersonDownMonitor();run(m,person('standing'),0,2);run(m,person(),2.1,3);
  assert.equal(warningKind(run(m,person('standing'),3.1,4.3)),null);
});
test('UI warnings respect exclusions and editing while retaining diagnostic classifier outputs',()=>{
  const predicted={state:'possible-fall',down:{state:'inactive',posture:'excluded'}};
  assert.equal(warningKind(predicted),null);assert.equal(displayLabel(predicted),'Excluded region');
  const transition={state:'monitoring',down:{state:'possible-fall',posture:'lying'}};
  assert.equal(warningKind(transition),'fall');assert.equal(warningKind(transition,true),null);
  assert.equal(displayLabel({state:'warming-up',down:{state:'inactive',posture:'standing'}}),'Standing');
});
test('Changing IDs and nonmonotonic time cannot inherit another down episode',()=>{
  const m=new PersonDownMonitor();run(m,person(),0,4);
  assert.equal(m.update([person('down',2)],4.1,640,480)[0].down.elapsed,0);
  assert.equal(m.update([person()],1,640,480)[0].down.elapsed,0);
});
test('Slow posture changes use the sustained-down path, not a rapid-fall claim',()=>{
  const m=new PersonDownMonitor();run(m,person('standing'),0,2);
  for(let i=1;i<=50;i++){
    const p=person('standing'),q=person(),f=i/50;
    p.landmarks=p.landmarks.map((a,j)=>({...a,x:a.x+(q.landmarks[j].x-a.x)*f,y:a.y+(q.landmarks[j].y-a.y)*f}));
    m.update([p],2+i/10,640,480);
  }
  const result=run(m,person(),7.1,15.3);
  assert.equal(result.down.state,'person-down');
  assert.equal(result.down.source,'sustained-posture');
});
test('Small seeded pose jitter and mirrored views preserve the rule decisions',()=>{
  let seed=42;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(const posture of ['standing','sitting','down'])for(const mirror of [false,true]){
    const m=new PersonDownMonitor();let result;
    for(let i=0;i<=180;i++){
      const p=person(posture);
      p.landmarks=p.landmarks.map(l=>({...l,x:(mirror?1-l.x:l.x)+(random()-.5)*.008,y:l.y+(random()-.5)*.008}));
      result=m.update([p],i/18,640,480)[0];
    }
    assert.equal(result.down.state,posture==='down'?'person-down':'inactive');
  }
});

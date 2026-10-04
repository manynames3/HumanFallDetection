import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LSTM} from '../browser/lstm.js';
import {features,poseFromLandmarks} from '../browser/features.js';
import {Detector} from '../browser/detector.js';
import {PersonDownMonitor,validPolygon,floorEvidence} from '../browser/person-down.js';
const manifest=JSON.parse(readFileSync(new URL('../browser/models/lstm.json',import.meta.url)));
const bytes=readFileSync(new URL('../browser/models/lstm.bin',import.meta.url));
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const fixture=JSON.parse(readFileSync(new URL('./fixtures/parity.json',import.meta.url)));
const close=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

test('Original MIT checkpoint retained and converted bytes match manifest',()=>{
  const source=readFileSync(new URL('../model/lstm_weights.sav',import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),manifest.source_sha256);
  assert.equal(manifest.source_sha256,fixture.source_sha256);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.binary_sha256);
});
test('All five features match unmodified upstream function outputs for 80 sequential poses',()=>{
  const previous=[];
  for(const item of fixture.cases){
    const output=features(item.pose,previous).values;
    output.forEach((v,i)=>close(v,item.features[i],1e-8));
    previous.push(item.pose);if(previous.length>2)previous.shift();
  }
});
test('Original two-layer LSTM matches independent NumPy float32 inference over 80 recurrent steps',()=>{
  const model=new LSTM(manifest,buffer);
  for(const item of fixture.cases){
    const result=model.step(item.features);
    result.logits.forEach((v,i)=>close(v,item.logits[i],.0001));
    assert.equal(result.prediction,item.logits.indexOf(Math.max(...item.logits)));
  }
  model.reset();model.step(fixture.cases[0].features).logits.forEach((v,i)=>close(v,fixture.cases[0].logits[i],.0001));
  assert.throws(()=>model.step([NaN,0,0,0,0]));
});
const pose=(x,time)=>({H:[x,.1],N:[x,.2],B:[x,.5],box:[x*640,40,x*640+100,420],time,landmarks:[]});
test('Separate IDs, classifier state, expiry and time-gap reset',()=>{
  const detector=new Detector(manifest,buffer);
  const a=detector.update([pose(.2,0),pose(.8,0)],0);
  assert.deepEqual(a.map(p=>p.id),[1,2]);assert.notEqual(detector.tracks[0].model,detector.tracks[1].model);
  const b=detector.update([pose(.8,.06),pose(.2,.06)],.06);assert.deepEqual(b.map(p=>p.id),[2,1]);
  const c=detector.update([pose(.2,1)],1);assert.equal(c[0].id,3);assert.equal(c[0].samples,1);
  const d=detector.update([pose(.2,3)],3);assert.equal(d[0].samples,1);
});
test('Fall filter requires history and nine fall samples; overlays are not confirmation of impact',()=>{
  const detector=new Detector(manifest,buffer);
  let current=pose(.5,0);current.N=[.3,.5];current.H=[.2,.5];
  detector.update([current],0);
  detector.tracks[0].model.step=()=>({prediction:0,score:1,logits:[]});
  for(let i=1;i<35;i++){current={...current,time:i/18};assert.equal(detector.update([current],i/18)[0].state,'warming-up');}
  current={...current,time:35/18};assert.equal(detector.update([current],35/18)[0].state,'possible-fall');
});
test('Low confidence and degenerate body input cannot silently produce green tracking',()=>{
  assert.equal(poseFromLandmarks(Array.from({length:33},()=>({x:.5,y:.5,visibility:.1})),640,480,0),null);
  assert.throws(()=>features({...pose(.5,1),N:[.5,.5],B:[.5,.5],H:[.5,.5]},[pose(.5,0)]));
  const detector=new Detector(manifest,buffer);
  const invalid={...pose(.5,1),box:[0,0,0,0]};assert.equal(detector.update([invalid],1)[0].state,'unavailable');
});
const floor={kind:'floor',points:[[.01,.01],[.99,.01],[.99,.99],[.01,.99]]};
function floorPerson(id=1){
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:.9,presence:.9}));
  for(const i of [11,12])landmarks[i]={...landmarks[i],x:.25,y:.55};
  for(const i of [23,24])landmarks[i]={...landmarks[i],x:.55,y:.57};
  for(const i of [25,26])landmarks[i]={...landmarks[i],x:.7,y:.58};
  for(const i of [27,28])landmarks[i]={...landmarks[i],x:.85,y:.6};
  return {id,state:'monitoring',landmarks};
}
test('Person already down warns only after 8 seconds, independent of classifier at 5 and 18 Hz',()=>{
  for(const hz of [5,18]){
    const m=new PersonDownMonitor();m.configure([floor]);let output;
    for(let i=0;i<=hz*8;i++){
      output=m.update([floorPerson()],i/hz,640,480)[0];
      assert.equal(output.state,'monitoring');
      assert.equal(output.down.state,i<hz*8?'down-evaluating':'person-down');
    }
  }
});
test('Automatic down checks work without zones; optional regions and unclear bodies gate evidence',()=>{
  const p=floorPerson();assert.equal(floorEvidence(p,[],640,480).eligible,true);
  const bed={kind:'bed',points:[[.2,.4],[.65,.4],[.65,.7],[.2,.7]]};
  assert.equal(floorEvidence(p,[floor,bed],640,480).eligible,false);
  assert.equal(floorEvidence(p,[floor,{...bed,kind:'sofa'}],640,480).eligible,false);
  assert.equal(floorEvidence(p,[{kind:'floor',points:[[0,0],[.1,0],[.1,.1],[0,.1]]}],640,480).eligible,false);
  const upright=floorPerson();for(const i of [11,12])upright.landmarks[i]={...upright.landmarks[i],x:.55,y:.2};
  assert.equal(floorEvidence(upright,[floor],640,480).eligible,false);
  const partial=floorPerson();for(const i of [27,28])partial.landmarks[i].visibility=.1;
  assert.equal(floorEvidence(partial,[floor],640,480).eligible,false);
});
test('Down timer pauses after brief occlusion and resets for long gaps, new tracks and calibration changes',()=>{
  const m=new PersonDownMonitor();m.configure([floor]);
  for(let i=0;i<40;i++)m.update([floorPerson()],i/5,640,480);
  assert.equal(m.update([floorPerson()],9,640,480)[0].down.elapsed,0);
  m.update([],9.1,640,480);assert.equal(m.update([floorPerson()],9.2,640,480)[0].down.elapsed,0);
  assert.equal(m.update([floorPerson(2)],9.3,640,480)[0].down.elapsed,0);
  m.configure([floor]);assert.equal(m.update([floorPerson(2)],9.4,640,480)[0].down.elapsed,0);
  const upright=floorPerson(2);for(const i of [11,12])upright.landmarks[i].x=.55;
  m.update([upright],9.5,640,480);assert.equal(m.update([floorPerson(2)],9.6,640,480)[0].down.elapsed,0);
});
test('Calibration rejects crossing, tiny and malformed polygons; angle uses pixel aspect ratio',()=>{
  assert.equal(validPolygon(floor.points),true);
  assert.equal(validPolygon([[0,0],[1,1],[0,1],[1,0]]),false);
  assert.equal(validPolygon([[0,0],[.01,0],[.01,.01]]),false);
  assert.equal(validPolygon([[0,0],[1,0],[NaN,1]]),false);
  const p=floorPerson();for(const i of [11,12])p.landmarks[i].y=.37;
  assert.equal(floorEvidence(p,[floor],640,480).eligible,true);
  assert.equal(floorEvidence(p,[floor],480,640).eligible,false);
});

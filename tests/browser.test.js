import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LSTM} from '../browser/lstm.js';
import {features,poseFromLandmarks} from '../browser/features.js';
import {Detector} from '../browser/detector.js';
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
  const c=detector.update([pose(.2,.8)],.8);assert.equal(c[0].id,3);assert.equal(c[0].samples,1);
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

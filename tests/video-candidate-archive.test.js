import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {score} from '../research/candidates/native-sequence-v5/inference/tools/video_temporal_features.mjs';
const base=new URL('../research/candidates/native-sequence-v5/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,base)));

test('archived candidate weights, inference and evidence match their frozen hashes',async()=>{
  const index=await read('artifacts.json');
  assert.equal(index.deployed,false);assert.equal(index.productionImported,false);
  for(const [name,expected] of Object.entries(index.files)){
    const bytes=await readFile(new URL(name,base));
    assert.equal(bytes.length,expected.bytes,name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256,name);
  }
  const report=await read('continuous-evaluation.json');
  assert.equal(report.groups.length,10);assert.equal(report.aggregate['cycle5-weak'].events,80);
  assert.equal(report.deploy,false);assert.equal(report.gates.prior.fewerMissed,false);
  assert.equal(report.gates.prior.fewerFalse,false);
});

test('frozen native model has consistent dimensions and executable archived inference',async()=>{
  const m=await read('cycle5-weak/model.json');
  assert.equal(m.mean.length,169);assert.equal(m.hidden,48);
  assert.equal(m.scale.length,m.mean.length);assert.equal(m.w1.length,m.mean.length*m.hidden);
  assert.equal(m.b1.length,m.hidden);assert.equal(m.w2.length,m.hidden);
  assert.ok(m.scale.every(x=>Number.isFinite(x)&&x>0));
  for(const key of ['mean','w1','b1','w2'])assert.ok(m[key].every(Number.isFinite));
  assert.equal(score(m,null),null);
  const result=score(m,m.mean);assert.ok(Number.isFinite(result)&&result>=0&&result<=1);
});

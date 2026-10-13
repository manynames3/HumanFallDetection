import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tcnScore} from '../research/candidates/temporal-v6/source/tools/video_tcn_v6.mjs';
const base=new URL('../research/candidates/temporal-v6/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,base)));

test('cycle6 archive pins trained weights and all failed evidence without deployment',async()=>{
  const index=await read('artifacts.json');
  assert.equal(index.deployed,false);assert.equal(index.productionImported,false);
  for(const [name,h]of Object.entries(index.files)){
    const bytes=await readFile(new URL(name,base));
    assert.equal(bytes.length,h.bytes,name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),h.sha256,name);
  }
  const report=await read('estimated-depth/evaluation.json');
  assert.equal(report.groups.length,20);assert.equal(report.developmentPredictions.length,359);
  assert.deepEqual([report.aggregate[18].baseline.missed,report.aggregate[18].baseline.falseEpisodes],[44,16]);
  assert.deepEqual([report.aggregate[18].candidate.missed,report.aggregate[18].candidate.falseEpisodes],[26,12]);
  assert.deepEqual(report.development.candidate,{missed:33,false:12});
  assert.equal(report.gates.developmentNotWorse,false);
  assert.equal(report.gates.seenRetestBothBetter,false);
  assert.equal((await read('calibration/selection.json')).selectedThreshold,null);
  const reserve=await read('reserved-data.json');
  assert.equal(reserve.clips.length,24);assert.equal(reserve.predictionsOpened,false);
  assert.equal(reserve.poseInferenceRun,false);
});

test('archived TCN is executable, finite and cannot score an absent current pose',async()=>{
  for(const folder of ['estimated-depth','zero-depth-coordinate']){
    const m=await read(folder+'/model.json');
    assert.equal(m.steps,18);assert.equal(m.dim,56);assert.equal(m.hidden,16);
    assert.equal(m.w1.length,m.kernel*m.dim*m.hidden);
    assert.equal(m.w2.length,m.kernel*m.hidden*m.hidden);
    assert.equal(m.mean.length,m.dim);assert.ok(m.scale.every(s=>Number.isFinite(s)&&s>0));
    assert.equal(tcnScore(m,null),null);
    const x=Array(m.steps*m.dim).fill(0),p=tcnScore(m,x);
    assert.ok(Number.isFinite(p)&&p>=0&&p<=1);
  }
});

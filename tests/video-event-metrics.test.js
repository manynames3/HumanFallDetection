import test from 'node:test';
import assert from 'node:assert/strict';
import {continuousMetrics} from '../tools/video_event_metrics.mjs';
const clip={duration:30,normalIntervals:[[0,9],[25,30]],events:[{id:'fall-1',start:10,processEnd:12},{id:'fall-2',start:20,processEnd:22}]};
test('a persistent pre-event warning cannot count as detecting two later falls',()=>{
  const r=continuousMetrics(Array.from({length:23},(_,i)=>i+1),clip);
  assert.equal(r.detected,0);assert.equal(r.falseEpisodes,1);
});
test('continuous metric counts separate falls, bounded latency and normal alerts',()=>{
  const r=continuousMetrics([5,5.05,10.5,11,21,26.1],clip,{silenceSeconds:2});
  assert.equal(r.detected,2);assert.equal(r.falseEpisodes,2);assert.equal(r.duringProcess,2);assert.equal(r.normalSeconds,14);
  assert.deepEqual(r.detections.map(d=>d.latency),[.5,1]);
});
test('late post-recovery alerts cannot rescue missed events',()=>{
  const r=continuousMetrics([16,28],clip);assert.equal(r.detected,0);assert.equal(r.falseEpisodes,1);
});

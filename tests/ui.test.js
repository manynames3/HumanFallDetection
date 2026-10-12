import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fullscreenSupport,isFullscreen,toggleFullscreen} from '../browser/ui.js';

function standard() {
  const calls=[],el={requestFullscreen:async()=>{calls.push('request');doc.fullscreenElement=el;}};
  const doc={fullscreenEnabled:true,fullscreenElement:null,exitFullscreen:async()=>{calls.push('exit');doc.fullscreenElement=null;}};
  return {doc,el,calls};
}

test('fullscreen is unsupported when the browser exposes no API',async()=>{
  const doc={},el={};
  assert.equal(fullscreenSupport(doc,el),null);
  assert.equal(isFullscreen(doc,el),false);
  assert.equal(await toggleFullscreen(doc,el),'unsupported');
  assert.equal(await toggleFullscreen(null,null),'unsupported');
});

test('fullscreen is unsupported when the document disables it',async()=>{
  const el={requestFullscreen:async()=>{}};
  assert.equal(await toggleFullscreen({fullscreenEnabled:false},el),'unsupported');
});

test('standard fullscreen enters then exits',async()=>{
  const {doc,el,calls}=standard();
  assert.equal(isFullscreen(doc,el),false);
  assert.equal(await toggleFullscreen(doc,el),'entered');
  assert.equal(isFullscreen(doc,el),true);
  assert.equal(await toggleFullscreen(doc,el),'exited');
  assert.equal(isFullscreen(doc,el),false);
  assert.deepEqual(calls,['request','exit']);
});

test('another element in fullscreen is not treated as ours',()=>{
  const {doc,el}=standard();
  doc.fullscreenElement={};
  assert.equal(isFullscreen(doc,el),false);
});

test('WebKit-prefixed fullscreen is used when the standard API is absent',async()=>{
  const calls=[],el={webkitRequestFullscreen:()=>{calls.push('request');doc.webkitFullscreenElement=el;}};
  const doc={webkitFullscreenEnabled:true,webkitFullscreenElement:null,webkitExitFullscreen:()=>{calls.push('exit');doc.webkitFullscreenElement=null;}};
  assert.equal(await toggleFullscreen(doc,el),'entered');
  assert.equal(await toggleFullscreen(doc,el),'exited');
  assert.deepEqual(calls,['request','exit']);
});

test('a rejected or throwing request reports failure instead of throwing',async()=>{
  const doc={fullscreenEnabled:true,fullscreenElement:null};
  assert.equal(await toggleFullscreen(doc,{requestFullscreen:async()=>{throw new DOMException('denied','NotAllowedError');}}),'failed');
  assert.equal(await toggleFullscreen(doc,{requestFullscreen:()=>{throw new TypeError('nope');}}),'failed');
});

test('UI markup keeps every camera and calibration control uniquely addressable',()=>{
  const html=readFileSync(new URL('../browser/index.html',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,'duplicate UI id');
  for(const name of ['app.js','calibration.js']){
    const source=readFileSync(new URL(`../browser/${name}`,import.meta.url),'utf8');
    for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),`${name} needs #${id}`);
  }
  assert.match(html,/<script type="module" src="\.\/app\.js"><\/script>/,'keep the QA camera injection seam');
});

test('Legend dots cannot inherit the fixed emergency-banner layout',()=>{
  const html=readFileSync(new URL('../browser/index.html',import.meta.url),'utf8');
  const legend=html.match(/<div class="legend">(.*?)<\/div>/s)?.[1];
  assert.ok(legend);
  for(const [,classes] of legend.matchAll(/class="([^"]+)"/g))assert.ok(!classes.split(/\s+/).includes('alert'),'reserve .alert for the warning banner');
  assert.match(html,/id="alert"[^>]+role="alert"/);
});

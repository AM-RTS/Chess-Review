import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame} from './helpers/app.mjs';
import fs from 'node:fs';
import {Chess} from '../lib/chess.js';
import {analyseCalibratedPosition} from '../lib/calibrated-search.js';

test('line settings default to two and migrate every stored count into the supported range',t=>{
 const a=app(t);assert.equal(a.state.settings.engineLines,2);assert.equal(a.state.settings.classifyLines,2);
 for(const value of [undefined,null,0,1,-4,'bad',2,3,4,8]){
  const settings={enginePath:'sf19',classifyLines:value,engineLines:value};a.call('migrateEngineSettings',settings);
  assert.ok([2,3,4].includes(settings.classifyLines));assert.equal(settings.engineLines,settings.classifyLines);
 }
});
test('UI and settings writes cannot select fewer than two lines',async t=>{
 const a=app(t);loadGame(a,'1. e4 e5');a.call('computeDerived');a.call('buildUI');a.state.settingsTab='engine';
 a.replace('scheduleReanalyze',()=>{});a.replace('renderEngineCurrent',()=>{});a.call('renderSettings');
 for(const key of ['classifyLines','engineLines']){
  const values=[...a.dom.window.document.querySelectorAll(`[data-setting="${key}"]`)].map(n=>Number(n.dataset.value));
  assert.deepEqual(values,[2,3,4]);
  await a.call('setEngineSetting',key,1);assert.equal(a.state.settings[key],2);
  await a.call('setEngineSetting',key,3);assert.equal(a.state.settings[key],3);
  await a.call('setEngineSetting',key,0);assert.equal(a.state.settings[key],2);assert.equal(a.store.settings[key],2);
 }
});

test('both review engines enforce two base lines',async()=>{
 const calibration=JSON.parse(fs.readFileSync(new URL('../data/calibration.json',import.meta.url)));
 for(const build of ['sf19','sf19lite']){
  const calls=[];const engine={buildKey:build,identity:build==='sf19'?'Stockfish 19':'Stockfish 19 Lite',async setOptions(){},async analyse(fen,depth,lines,history,progress,options){calls.push({lines,options});return {bestmove:'e2e4',score:{cp:0,wdl:[100,800,100]}};}};
  await analyseCalibratedPosition(engine,{fen:new Chess().fen(),history:{initialFen:new Chess().fen(),moves:[]},played:'e2e4',settings:{enginePath:build,classifyLines:1,engineDepth:16,engineHash:16,engineSkill:20},calibration});
  assert.equal(calls[0].lines,2);
  if(build==='sf19lite')assert.deepEqual(calls[0].options.budget,{kind:'nodes',value:20000});
 }
});

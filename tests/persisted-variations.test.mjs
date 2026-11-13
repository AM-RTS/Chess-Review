import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,fakeEngine,settle} from './helpers/app.mjs';

async function reviewed(t) {
  const a=app(t),S=loadGame(a,'1. e4 e5');S.meta={gameId:'saved-game'};
  S.bests=S.positions.map((p,i)=>({bestmove:i<S.total?S.positions[i+1].from+S.positions[i+1].to:'g1f3',
    score:{cp:0},playedScore:{cp:0},lines:[],calibration:{version:a.run('CALIB.version'),build:'sf19'}}));
  a.call('computeDerived');a.call('buildUI');a.call('renderAll');
  a.replace('startAnalysis',()=>{throw Error('Completed review must restore');});
  let calls=0;S.liveEngine=fakeEngine(async()=>{calls++;return {score:{cp:17},bestmove:'e7e5',lines:[]};});
  const request=a.run('requestLiveEval');let pending;
  a.replace('requestLiveEval',()=>pending=request());
  a.call('playLine','d2d4 d7d5');a.call('stopLineWalk');await pending;
  await settle();await a.run('_libraryWriteQueue');
  return {...a,calls:()=>calls};
}
test('library reopening restores explored lines and completed evidence without another search',async t=>{
  const a=await reviewed(t),rec=structuredClone(a.store.library[0]);
  const saved=structuredClone(a.store['analysis:'+rec.id]);assert.equal(saved.variations.lines.length,1);
  const prior=JSON.stringify(saved.variations.lines[0].positions[1].best),calls=a.calls();
  a.replace('startAnalysis',()=>{});
  await a.call('applyGame',{pgn:'1. c4 e5',meta:{gameId:'other'},analysis:null});
  a.replace('startAnalysis',()=>{throw Error('Saved review must restore');});
  await a.call('openLibraryGame',rec);
  assert.equal(a.run('exploredVariations.size'),1);assert.equal(a.run('UI.variationPicker.hidden'),false);
  const key=a.run('[...exploredVariations.keys()][0]');
  await a.call('selectVariation',key);await settle();
  assert.equal(a.call('activePos').san,'d4');
  assert.equal(JSON.stringify(a.state.variation.positions[1].best),prior);assert.equal(a.calls(),calls);
});
test('different settings retain moves but invalidate explored evaluations; damaged lines are ignored',async t=>{
  const a=await reviewed(t),saved=structuredClone(a.store['analysis:saved-game']);
  a.state.settings.engineDepth++;
  a.replace('startAnalysis',()=>{});
  await a.call('applyGame',{pgn:a.state.pgn,meta:{gameId:'saved-game'},analysis:saved});
  const v=a.run('[...exploredVariations.values()][0]');
  assert.equal(v.positions[1].san,'d4');assert.equal(v.positions[1].eval,null);assert.equal(v.positions[1].best,null);
  saved.variations.lines[0].positions[1].from='a8';
  await a.call('applyGame',{pgn:a.state.pgn,meta:{gameId:'saved-game'},analysis:saved});
  assert.equal(a.run('exploredVariations.size'),0);
});

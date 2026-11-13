import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,fakeEngine,settle} from './helpers/app.mjs';

async function board(t,pgn='*',standalone=true) {
  const a=app(t);loadGame(a,'1. e4 e5');a.call('computeDerived');a.call('buildUI');
  a.replace('ensureLiveEngine',async()=>fakeEngine());
  a.replace('startAnalysis',()=>{});
  await a.call('applyGame',{mode:standalone?'analysis':undefined,pgn,meta:{},analysis:null});await settle();
  a.replace('requestLiveEval',()=>a.call('refreshVariation'));
  return a;
}
function play(a,pv) {a.call('playLine',pv);a.call('stopLineWalk');}
function choose(a,san) {
  const select=a.dom.window.document.querySelector('[aria-label="Explored lines"]');
  const option=[...select.options].find(o=>o.textContent.includes(san));assert.ok(option);
  select.value=option.value;select.dispatchEvent(new a.dom.window.Event('change'));
}
test('switching branches retains continuations and evaluations; PGN exports the selected line',async t=>{
  const a=await board(t);play(a,'e2e4 e7e5');
  a.state.variation.positions[1].eval={cp:123};a.state.variation.positions[1].best={score:{cp:-123},bestmove:'e7e5',lines:[]};
  a.call('gotoVar',0);play(a,'d2d4 d7d5');
  choose(a,'e4 e5');assert.equal(a.state.variation.idx,1);
  assert.equal(a.state.variation.positions[1].eval.cp,123);
  a.call('navNext');assert.equal(a.call('activePos').san,'e5');
  assert.match(a.call('standalonePgn'),/1\. e4 e5/);
  choose(a,'d4 d5');assert.match(a.call('standalonePgn'),/1\. d4 d5/);
  assert.equal(a.run('exploredVariations.size'),2);
});
test('review alternatives remain selectable after exiting to the recorded game',async t=>{
  const a=await board(t,'1. e4 e5',false);
  a.call('applyUserMove','d2','d4',false);a.call('exitAnalysis',0);
  assert.equal(a.state.analysisMode,false);choose(a,'d4');
  assert.equal(a.state.analysisMode,true);assert.equal(a.call('activePos').san,'d4');
  assert.equal(a.state.pgn,'1. e4 e5');
});
test('settings invalidate retained evaluations and loading a new board clears retained lines',async t=>{
  const a=await board(t);play(a,'e2e4 e7e5');a.state.variation.positions[1].eval={cp:123};
  a.call('gotoVar',0);play(a,'d2d4');a.call('invalidateVariationEvals');choose(a,'e4 e5');
  assert.equal(a.state.variation.positions[1].eval,null);
  await a.call('applyGame',{mode:'analysis',pgn:'*',meta:{},analysis:null});
  assert.equal(a.run('exploredVariations.size'),0);
  assert.equal(a.run('UI.variationPicker.hidden'),true);
});
test('promotion branches preserve promotion identity',async t=>{
  const a=await board(t,'[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n*');
  play(a,'a7a8q');a.call('gotoVar',0);play(a,'a7a8n');choose(a,'a8=Q');
  assert.equal(a.state.variation.positions[1].promotion,'q');
  choose(a,'a8=N');assert.equal(a.state.variation.positions[1].promotion,'n');
});

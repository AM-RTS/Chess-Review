import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,fakeEngine,settle,deferred} from './helpers/app.mjs';

async function analysis(t,pgn='*') {
  const a=app(t);loadGame(a,'1. e4 e5');a.call('computeDerived');a.call('buildUI');
  a.replace('ensureLiveEngine',async()=>fakeEngine());
  await a.call('applyGame',{mode:'analysis',pgn,meta:{},analysis:null});await settle();
  return a;
}
test('standalone starts with all pieces and live evaluation without batch review',async t=>{
  const a=await analysis(t),S=a.state,doc=a.dom.window.document;
  assert.equal(S.standalone,true);assert.equal(S.analysisMode,true);assert.equal(S.analyzing,false);
  assert.equal(S.total,0);assert.equal(S.variation.idx,0);assert.equal(doc.querySelectorAll('.sq .piece,.sq .piece-img,.sq .piece-svg').length,32);
  assert.deepEqual(JSON.parse(JSON.stringify(a.call('activeEval'))),{cp:0});
  assert.ok(doc.querySelector('.analysis-tools'));assert.equal(doc.querySelector('.exit-analysis'),null);
  assert.match(doc.title,/Analysis/);assert.equal(a.store.library,undefined);
});
test('moves, undo, redo and replacing a branch retain the root and receive feedback',async t=>{
  const a=await analysis(t),S=a.state;
  a.call('applyUserMove','e2','e4',false);await settle();
  assert.equal(S.variation.positions[1].san,'e4');assert.ok(S.variation.positions[1].classif);
  a.call('navPrev');await settle();assert.equal(S.variation.idx,0);assert.equal(S.analysisMode,true);
  a.call('navNext');await settle();assert.equal(S.variation.idx,1);
  a.call('gotoVar',0);a.call('applyUserMove','d2','d4',false);await settle();
  assert.equal(S.variation.positions.length,2);assert.equal(S.variation.positions[1].san,'d4');
  assert.match(a.dom.window.document.getElementById('movesBody').textContent,/d4/);
  assert.doesNotMatch(a.dom.window.document.getElementById('movesBody').textContent,/e4/);
  a.call('exitAnalysis');assert.equal(S.analysisMode,true);
});

test('standalone moves share review table styles, paired colors and navigation', async t => {
  const a = await analysis(t, '1. e4 e5 2. Nf3'), S = a.state, doc = a.dom.window.document;
  for (const style of ['rows', 'cards', 'compact']) {
    S.settings.mlStyle = style; a.call('renderMoves');
    const list = doc.querySelector('#movesBody .movelist');
    assert.ok(list.classList.contains('ml-' + style));
    assert.equal(list.querySelectorAll('.ml-move').length, 3);
    assert.equal(list.querySelectorAll('.pc').length, 3);
    if (style !== 'compact') {
      const rows = list.querySelectorAll('.ml-pair');
      assert.equal(rows.length, 2);
      assert.deepEqual([...rows[0].querySelectorAll('.ml-move')].map(n => n.textContent.replace(/[^a-z0-9]/g, '')), ['e4', 'e5']);
    }
  }
  doc.querySelector('[data-var="1"]').click(); await settle();
  assert.equal(S.variation.idx, 1);
});
test('FEN and PGN import validate before changing the board and export a replayable line',async t=>{
  const a=await analysis(t),fen='7k/8/8/8/8/8/8/K7 b - - 0 21';
  const payload=a.call('analysisInputPayload',fen);await a.call('applyGame',payload);await settle();
  assert.equal(a.call('activePos').fen,fen);assert.match(a.call('standalonePgn'),/\[FEN /);
  const previous=a.state.variation;
  assert.throws(()=>a.call('analysisInputPayload','invalid position'));assert.equal(a.state.variation,previous);
  await a.call('applyGame',a.call('analysisInputPayload','1. e4 e5 2. Nf3'));await settle();
  assert.equal(a.state.variation.idx,3);assert.equal(a.call('buildPositions',a.call('standalonePgn')).length,4);
  a.call('gotoVar',1);a.call('rememberReviewJob');
  const saved=await a.call('loadJob');assert.equal(saved.mode,'analysis');assert.equal(saved.meta.analysisIndex,1);
  await a.call('applyGame',saved);await settle();assert.equal(a.state.variation.idx,1);assert.equal(a.state.variation.positions.length,4);
});
test('engine changes reanalyze live positions and switching back to review restores normal mode',async t=>{
  const a=await analysis(t);a.state.variation.positions[0].best=null;
  await a.call('startAnalysis');await settle();assert.ok(a.state.variation.positions[0].best);
  let batches=0;a.replace('startAnalysis',()=>{batches++;});
  await a.call('applyGame',{pgn:'1. e4 e5',meta:{},analysis:null});
  assert.equal(a.state.standalone,false);assert.equal(a.state.analysisMode,false);assert.equal(batches,1);
  assert.equal(a.dom.window.document.querySelector('.analysis-tools'),null);
});

test('streamed evaluation and lines update before completion and stale results cannot change another position',async t=>{
  const a=await analysis(t),done=deferred();let preview;
  a.replace('ensureLiveEngine',async()=>fakeEngine(async(...args)=>{preview=args[4];return done.promise;}));
  a.call('applyUserMove','e2','e4',false);await settle();
  const node=a.state.variation.positions[1];
  preview({score:{cp:-80},bestmove:'e7e5',lines:[{score:{cp:-80},pv:'e7e5',depth:5}]});
  assert.equal(node.eval,null);assert.equal(a.call('activeEval').cp,80);
  assert.equal(a.call('activeBest').bestmove,'e7e5');
  assert.match(a.dom.window.document.querySelector('.engine-body').textContent,/e5/);
  a.call('navPrev');await settle();
  done.resolve({score:{cp:-900},bestmove:'e7e5',lines:[]});await settle();
  assert.equal(a.state.variation.idx,0);assert.equal(node.eval,null);assert.equal(node.searchPreview,null);
  assert.equal(a.call('activeEval').cp,0);
});

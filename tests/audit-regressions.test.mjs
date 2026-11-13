import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../lib/chess.js';
import {app, loadGame, branch, deferred, settle, fakeEngine} from './helpers/app.mjs';

function quiet(a) {
  for (const name of ['paintBoard','renderEvalBar','renderMoves','renderPlayers','renderControls',
    'renderReview','renderStats','renderEngineCurrent','renderBestArrow','renderGraph','renderLibrary']) a.replace(name,()=>{});
}

test('a search-setting change cancels the batch before the debounce or storage write finishes', async t => {
  const a=app(t), S=loadGame(a,'1. e4'); quiet(a);
  S.settings.engineWorkers=1;
  const result=deferred(), writing=deferred(), started=deferred();
  const engine=fakeEngine(async()=>{started.resolve();return result.promise;});engine.buildKey='sf19';
  a.replace('createEngine',async()=>engine);
  let saves=0;a.replace('saveToLibrary',()=>{saves++;});
  const work=a.call('startAnalysis');await started.promise;
  a.replace('writeSettings',()=>writing.promise);
  const change=a.call('setEngineSetting','engineDepth',17);
  assert.equal(engine.dead,true);
  result.resolve({score:{cp:0},bestmove:'e2e4',lines:[]});await work;
  assert.equal(saves,0);
  writing.resolve();await change;
});

test('display-only line changes preserve engine identity and cached variation evaluations', async t => {
  const a=app(t),S=loadGame(a,'1. e4');quiet(a);const v=branch(a);
  S.engineFallbackBuild=S.activeEngineBuild='sf19lite';
  const engine=fakeEngine();S.liveEngine=engine;
  const before=JSON.stringify(v.positions),gen=S.batchGen;
  await a.call('setEngineSetting','engineLines',3);
  assert.equal(a.call('activeEngineName'),'Stockfish 19 Lite (fallback)');
  assert.equal(engine.dead,false);assert.equal(S.batchGen,gen);
  assert.equal(JSON.stringify(v.positions),before);
});

test('matching IDs from different sites retain both games and old library records still open', async t => {
  const a=app(t);quiet(a);
  for(const [site,pgn] of [['chess.com','1. e4 e5'],['lichess.org','1. d4 d5']]) {
    loadGame(a,pgn);a.call('computeDerived');
    a.state.meta={gameId:'12345678',url:`https://${site}/12345678`};
    await a.call('saveToLibrary');
  }
  assert.equal(a.store.library.length,2);
  for(const rec of a.store.library)assert.equal(a.store['analysis:'+rec.id].pgn,rec.pgn);
  const legacy={...a.store.library[0],id:'12345678',fav:true};
  a.store.library=[legacy];a.state.library=[legacy];
  a.store['analysis:12345678']=a.store['analysis:'+a.call('currentGameId')];
  delete a.store['analysis:'+a.call('currentGameId')];
  const oldPayload={pgn:legacy.pgn,meta:{...legacy.meta,libraryId:legacy.id}};
  assert.equal((await a.call('loadSavedAnalysis',oldPayload))?.pgn,legacy.pgn);
  a.state.meta=oldPayload.meta;
  await a.call('markCurrentSolved');assert.equal(a.store.library[0].solved,true);
  loadGame(a,legacy.pgn);a.call('computeDerived');a.state.meta={...legacy.meta};delete a.state.meta.libraryId;
  await a.call('saveToLibrary');
  assert.equal(a.store.library.length,1);assert.equal(a.store.library[0].fav,true);
  assert.equal(a.store['analysis:12345678'],undefined);
});

test('continuing past a claimable repetition keeps results and review evidence available', async t => {
  const a=app(t),S=loadGame(a,'1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. e4 e5');quiet(a);
  S.idx=8;
  assert.equal(a.call('terminalScore',S.positions[8].fen,8),null);
  assert.equal(a.call('activeResult'),null);
  const v=branch(a);v.idx=8;assert.equal(a.call('activeResult'),null);
  S.analysisMode=false;S.variation=null;S.settings.engineWorkers=1;
  const engine=fakeEngine(async(fen,d,l,h,p,options)=>({score:{cp:0},
    bestmove:options?.searchMove||new Chess(fen).moves({verbose:true})[0].lan,lines:[]}));
  engine.buildKey='sf19';a.replace('createEngine',async()=>engine);
  await a.call('startAnalysis');await settle();await a.run('_libraryWriteQueue');
  assert.equal(S.acc.w,100);assert.equal(S.acc.b,100);
  assert.equal(a.call('canRestoreAnalysis',a.store['analysis:'+a.call('currentGameId')]),true);
  const saved=a.store['analysis:'+a.call('currentGameId')];
  const oldKey=JSON.parse(saved.settingsKey);oldKey.splice(2,0,'old-context','old-full-rating','old-lite-rating');
  assert.equal(a.call('canRestoreAnalysis',{...saved,settingsKey:JSON.stringify(oldKey)}),true);
});

test('extending a repeated live line invalidates the cached Draw display',t=>{
  const a=app(t);loadGame(a,'1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8');
  const v=branch(a);assert.equal(a.call('activeResult'),'Draw');
  const chess=new Chess(v.positions.at(-1).fen),move=chess.move('e4');
  v.positions.push({...move,fen:chess.fen()});
  assert.equal(a.call('activeResult'),null);
});

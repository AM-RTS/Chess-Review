import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../lib/chess.js';
import {app,loadGame,branch,fakeEngine,deferred,settle} from './helpers/app.mjs';

function live(t,build='sf19') {
  const a=app(t),S=loadGame(a,'1. e4 e5');S.settings.enginePath=build;branch(a,0,0);
  for(const name of ['paintBoard','renderEvalBar','renderMoves','renderPlayers','renderControls',
    'renderReview','renderStats','renderEngineCurrent','renderBestArrow'])a.replace(name,()=>{});
  let calls=0;
  const engine=fakeEngine(async(fen,depth,lines)=>{
    calls++;const moves=new Chess(fen).moves({verbose:true});
    return {score:{cp:0},bestmove:moves[0].lan,lines:moves.slice(0,lines).map((m,i)=>({multipv:i+1,score:{cp:0},pv:m.lan,depth,bound:'exact'}))};
  });engine.buildKey=build;S.liveEngine=engine;
  let pending;const request=a.run('requestLiveEval');
  a.replace('requestLiveEval',()=>pending=request());
  return {...a,calls:()=>calls,engine,async play(pv){a.call('playLine',pv);a.call('stopLineWalk');await pending;}};
}

for(const build of ['sf19','sf19lite'])test(build+': replaying a searched line reuses evaluations without promoting its unsearched tail',async t=>{
  const a=live(t,build);
  await a.play('e2e4 e7e5');const v=a.state.variation;
  assert.equal(a.calls(),1);assert.ok(v.positions[1].best);assert.equal(v.positions[2].best,null);
  const saved=JSON.stringify(v.positions[1].best);
  v.idx=0;await a.play('e2e4 e7e5');assert.equal(a.calls(),1);
  assert.equal(JSON.stringify(v.positions[1].best),saved);
  v.positions[1].best.score.cp=999;
  v.idx=0;await a.play('d2d4');assert.equal(a.calls(),2);
  v.idx=0;await a.play('e2e4');assert.equal(a.calls(),2);
  assert.equal(JSON.stringify(v.positions[1].best),saved,'cache values are isolated from node mutations');
});

test('cache entries follow search settings and are cleared with the live session',async t=>{
  const a=live(t);await a.play('e2e4');const v=a.state.variation;
  for(const [key,value] of [['engineLines',3],['engineDepth',10]]) {
    a.state.settings[key]=value;v.idx=0;const before=a.calls();await a.play('e2e4');assert.equal(a.calls(),before+1);
  }
  assert.equal(a.run('liveEvalCache.size'),3);
  a.call('resetLiveEngine');assert.equal(a.run('liveEvalCache.size'),0);
});

test('identical FENs with different move histories do not share cached results',async t=>{
  const a=live(t),v=a.state.variation;
  const use=pgn=>{v.positions=a.call('buildPositions',pgn).map((p,i)=>({...p,eval:i?null:{cp:0},best:i?null:a.state.bests[0]}));v.idx=4;};
  use('1. Nf3 Nf6 2. Ng1 Ng8');await a.call('requestLiveEval');const fen=v.positions[4].fen,before=a.calls();
  use('1. Nc3 Nc6 2. Nb1 Nb8');assert.equal(v.positions[4].fen,fen);
  await a.call('requestLiveEval');assert.equal(a.calls(),before+4);
});

test('a canceled search cannot populate the live cache',async t=>{
  const a=live(t),done=deferred();a.engine.analyse=()=>done.promise;
  a.call('playLine','e2e4');a.call('stopLineWalk');await settle();
  a.state.variation.idx=0;await a.call('requestLiveEval');
  done.resolve({score:{cp:0},bestmove:'e7e5',lines:[]});await settle();
  assert.equal(a.run('liveEvalCache.size'),0);
});

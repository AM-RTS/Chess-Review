import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,branch,fakeEngine,deferred,settle} from './helpers/app.mjs';

function candidate(t) {
  const a=app(t),S=loadGame(a,'1. e4 e5 2. Nf3',[0,0,400,400].map(cp=>({cp})));
  S.bests[2]={score:{cp:400},bestmove:'g1f3',lines:[{score:{cp:400},pv:'g1f3',depth:4,bound:'exact',multipv:1}]};
  a.call('computeDerived');
  return a;
}
const result=(other=0,best='g1f3')=>({bestmove:best,lines:[
  {score:{cp:400},pv:best,depth:4,bound:'exact',multipv:1},
  {score:{cp:other},pv:'d2d4',depth:4,bound:'exact',multipv:2},
]});
function quiet(a){for(const name of ['paintBoard','renderEvalBar','renderMoves','renderPlayers','renderControls','renderReview','renderStats','renderEngineCurrent','renderBestArrow','renderGraph','renderLibrary']) a.replace(name,()=>{});}

test('one-line Great candidates get a separate exact two-line check without changing scoring inputs',async t=>{
  const a=candidate(t),S=a.state;assert.deepEqual(Array.from(S.greatCandidates),[3]);assert.equal(S.classif[3],'best');
  const original=JSON.stringify({bests:S.bests,evals:S.evals,acc:S.acc,elo:S.accElo,perMove:S.accMove});let searches=0;
  const engine=fakeEngine(async(fen,depth,lines,history,progress,options)=>{
    searches++;assert.equal(fen,S.positions[2].fen);assert.equal(lines,2);assert.equal(depth,4);
    assert.equal(history.moves.join(' '),'e2e4 e7e5');assert.equal(options.requireExact,true);return result();
  });
  await a.call('verifyGreatCandidates',S,async()=>engine,()=>true);a.call('computeDerived');
  assert.equal(S.classif[3],'great');assert.equal(searches,1);
  assert.equal(JSON.stringify({bests:S.bests,evals:S.evals,acc:S.acc,elo:S.accElo,perMove:S.accMove}),original);
  await a.call('verifyGreatCandidates',S,async()=>engine,()=>true);assert.equal(searches,1);
});

test('close alternatives and a changed best move retain Best and cache the negative result',async t=>{
  for(const verification of [result(390),result(0,'b1c3')]){
    const a=candidate(t),S=a.state;let searches=0;
    const engine=fakeEngine(async()=>{searches++;return verification;});
    await a.call('verifyGreatCandidates',S,async()=>engine,()=>true);a.call('computeDerived');assert.equal(S.classif[3],'best');
    await a.call('verifyGreatCandidates',S,async()=>engine,()=>true);assert.equal(searches,1);
  }
});

test('invalid verification evidence cannot award Great',async t=>{
  for(const edit of [r=>r.lines[1].depth--,r=>r.lines[1].bound='upperbound',r=>r.lines[1].pv='d2d5']){
    const a=candidate(t),r=result();edit(r);
    await a.call('verifyGreatCandidates',a.state,async()=>fakeEngine(async()=>r),()=>true);
    a.call('computeDerived');assert.equal(a.state.classif[3],'best');
  }
});

test('existing two-line evidence and Brilliant moves need no extra search',async t=>{
  const a=candidate(t),S=a.state;let requests=0;const unnecessary=async()=>{requests++;return fakeEngine();};
  S.bests[2]=result();a.call('computeDerived');
  await a.call('verifyGreatCandidates',S,unnecessary,()=>true);assert.equal(S.classif[3],'great');assert.equal(requests,0);
  loadGame(a,'[SetUp "1"]\n[FEN "7k/8/4p3/8/8/8/8/K2Q4 w - - 0 1"]\n\n1. Qd5');a.call('computeDerived');
  assert.equal(S.classif[1],'brilliant');assert.equal(S.greatCandidates.length,0);
  await a.call('verifyGreatCandidates',S,unnecessary,()=>true);assert.equal(requests,0);
});

test('verification cache separates histories and engine settings; canceled and failed checks do not certify',async t=>{
  const a=candidate(t),S=a.state;let calls=0,current=true;const pending=deferred();
  const engine=fakeEngine(async()=>{calls++;return pending.promise;});
  const check=a.call('verifyGreatCandidates',S,async()=>engine,()=>current);await settle();current=false;pending.resolve(result());await check;
  a.call('computeDerived');assert.equal(S.classif[3],'best');
  current=true;engine.analyse=async()=>{calls++;return result();};
  await a.call('verifyGreatCandidates',S,async()=>engine,()=>current);assert.equal(calls,2);
  const key=a.call('greatVerificationKey',S,3);S.settings.engineDepth++;
  assert.notEqual(a.call('greatVerificationKey',S,3),key);
  a.call('computeDerived');assert.equal(S.classif[3],'best');
  await a.call('verifyGreatCandidates',S,async()=>fakeEngine(async()=>{throw Error('optional search failed');}),()=>true);
  assert.equal(S.analysisError,null);a.call('computeDerived');assert.equal(S.classif[3],'best');
  const historyKey=a.call('greatVerificationKey',S,3);S.positions[0]={...S.positions[0],fen:S.positions[0].fen.replace(' 0 1',' 8 1')};
  assert.notEqual(a.call('greatVerificationKey',S,3),historyKey);
});

test('live cached positions trigger verification even with one visible panel line',async t=>{
  const a=candidate(t);quiet(a);const v=branch(a);a.state.settings.engineLines=1;
  let checks=0;a.state.liveEngine=fakeEngine(async(fen,depth,lines)=>{checks++;assert.equal(lines,2);return result();});
  await a.call('requestLiveEval');assert.equal(v.positions[3].classif,'great');assert.equal(checks,1);assert.equal(a.state.settings.engineLines,1);
  a.call('gotoVar',2);await settle();a.call('gotoVar',3);await settle();assert.equal(checks,1);
});

test('navigation cancels a pending live Great check without accepting its late result',async t=>{
  const a=candidate(t);quiet(a);const v=branch(a),pending=deferred();let checks=0;
  a.state.liveEngine=fakeEngine(async()=>{checks++;return pending.promise;});
  const check=a.call('requestLiveEval');await settle();a.call('gotoVar',1);await settle();pending.resolve(result());await check;
  assert.equal(v.idx,1);assert.notEqual(v.positions[3].classif,'great');
  a.state.liveEngine=fakeEngine(async()=>{checks++;return result();});a.call('gotoVar',3);await settle();
  assert.equal(v.positions[3].classif,'great');assert.equal(checks,2);
});

test('a sacrifice that remains losing cannot become Great or launch verification',async t=>{
  const a=app(t),S=loadGame(a,'[SetUp "1"]\n[FEN "7k/8/4p3/8/8/8/8/K2Q4 w - - 0 1"]\n\n1. Ka2 Kh7 2. Qd5',[-900,-900,-100,-100].map(cp=>({cp})));
  S.bests[2]={score:{cp:-100},bestmove:'d1d5',lines:[]};a.call('computeDerived');
  assert.equal(a.call('_sacAt',3),true);assert.equal(S.classif[3],'best');
  await a.call('verifyGreatCandidates',S,async()=>assert.fail('Still-losing moves need no Great verification'),()=>true);
  a.call('computeDerived');assert.equal(S.classif[3],'best');
});

test('a completed review verifies candidates before saving and a cached review verifies on restore',async t=>{
  const a=candidate(t),S=a.state;quiet(a);S.settings.engineWorkers=1;S.settings.classifyLines=3;let checks=0,saved=0;
  const engine=()=>{
    const eng=fakeEngine(async(fen,depth,lines,history,progress,options)=>{
      const idx=history.moves.length;
      if(lines===2){
        if(idx===2){checks++;return result();}
        assert.equal(idx,0);return {bestmove:'e2e4',lines:[
          {score:{cp:0},pv:'e2e4',depth:4,bound:'exact',multipv:1},
          {score:{cp:0},pv:'d2d4',depth:4,bound:'exact',multipv:2},
        ]};
      }
      const moves=['e2e4','a7a6','g1f3','b8c6'],scores=[0,0,400,-400];
      const best=options.searchMove || moves[idx],cp=options.searchMove==='e7e5' ? -400 : scores[idx];
      return {score:{cp},bestmove:best,pv:best,lines:[{score:{cp},pv:best,depth:4,bound:'exact',multipv:1}]};
    });eng.buildKey='sf19';return eng;
  };
  a.replace('createEngine',async()=>engine());a.replace('saveToLibrary',()=>{saved++;assert.equal(S.classif[3],'great');});
  await a.call('startAnalysis');assert.equal(S.classif[3],'great');assert.equal(checks,1);assert.equal(saved,1);assert.equal(S.analyzing,false);
  a.run('greatVerificationCache.clear()');a.call('computeDerived');assert.equal(S.classif[3],'best');
  const numeric=JSON.stringify({bests:S.bests,evals:S.evals,acc:S.acc,elo:S.accElo});
  await a.call('verifyRestoredGreatMoves');assert.equal(S.classif[3],'great');assert.equal(checks,2);
  assert.equal(JSON.stringify({bests:S.bests,evals:S.evals,acc:S.acc,elo:S.accElo}),numeric);
  assert.equal(S.evalEngines.length,0);
});

test('sound winning sacrifices receive Brilliant without Great verification',async t=>{
  const a=app(t),S=loadGame(a,'[SetUp "1"]\n[FEN "7k/8/4p3/8/8/8/8/K2Q4 w - - 0 1"]\n\n1. Ka2 Kh7 2. Qd5',[0,0,1000,1000].map(cp=>({cp})));
  S.bests[2]={score:{cp:1000},bestmove:'d1d5',lines:[{score:{cp:1000},pv:'d1d5',depth:4,bound:'exact',multipv:1}]};a.call('computeDerived');
  assert.equal(S.greatCandidates.length,0);assert.equal(S.classif[3],'brilliant');
  await a.call('verifyGreatCandidates',S,async()=>fakeEngine(async()=>({bestmove:'d1d5',lines:[
    {score:{cp:1000},pv:'d1d5',depth:4,bound:'exact',multipv:1},
    {score:{cp:0},pv:'d1e1',depth:4,bound:'exact',multipv:2},
  ]})),()=>true);
  a.call('computeDerived');assert.equal(S.classif[3],'brilliant');assert.equal(S.greatCandidates.length,0);
});

test('only top Excellent replies qualify, and a contextual opponent Mistake also triggers verification',async t=>{
  const a=candidate(t),S=a.state;
  S.bests[2].bestmove='b1c3';S.bests[2].lines[0].pv='b1c3';a.call('computeDerived');
  assert.equal(S.classif[3],'excellent');assert.equal(S.greatCandidates.length,0);
  S.evals=[-210,-210,0,0].map(cp=>({cp}));
  S.bests[2]={score:{cp:0},bestmove:'g1f3',lines:[{score:{cp:0},pv:'g1f3',depth:4,bound:'exact',multipv:1}]};
  a.call('computeDerived');assert.equal(S.classif[2],'mistake');assert.deepEqual(Array.from(S.greatCandidates),[3]);
  const r=result(-500);r.lines[0].score.cp=0;
  await a.call('verifyGreatCandidates',S,async()=>fakeEngine(async()=>r),()=>true);a.call('computeDerived');assert.equal(S.classif[3],'great');
});


// Synthetic score/sacrifice inputs exercise the shared policy, not game-specific exceptions.
for(const engine of ['sf19','sf19lite'])for(const color of ['w','b'])test(engine+' '+color+': losing moves require a drawing or winning result for special grades',t=>{
 const a=app(t),ply=color==='w'?3:4,sign=color==='w'?1:-1;
 for(const after of [{cp:-500},{cp:-51},{cp:-50},{cp:0},{cp:300},{mate:-3},{mate:3}])for(const sacrifice of [false,true]){
  const S=loadGame(a,'1. e4 e5 2. Nf3 Nc6');S.settings.enginePath=engine;
  S.evals=S.positions.map(()=>({cp:-500*sign}));S.evals[ply]=after.mate?{mate:after.mate*sign}:{cp:after.cp*sign};
  const played=S.positions[ply].from+S.positions[ply].to,alternative=color==='w'?'d2d4':'d7d5';
  S.bests[ply-1]={score:after,playedScore:after,bestmove:played,lines:[
    {score:after,pv:played,depth:4,bound:'exact',multipv:1},
    {score:{cp:-1500},pv:alternative,depth:4,bound:'exact',multipv:2},
  ]};S._sacCache=new Array(S.total+1).fill(false);S._sacCache[ply]=sacrifice;a.call('computeDerived');
  const eligible=after.mate!=null?after.mate>0:after.cp>=-50;
  assert.equal(S.classif[ply],eligible?(sacrifice?'brilliant':'great'):'best',JSON.stringify({after,sacrifice}));
  if(!eligible)assert.equal(S.greatCandidates.includes(ply),false);
  const v=branch(a,0,ply);v.positions[ply]._sac=sacrifice;a.call('classifyVariationMoves');
  assert.equal(v.positions[ply].classif,S.classif[ply]);S.analysisMode=false;S.variation=null;
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,fakeEngine} from './helpers/app.mjs';

// User-supplied game; scores below were captured from bundled full SF19 at depth 16.
const pgn='1. Nf3 d5 2. d4 c5 3. e3 Nc6 4. Bb5 Nf6 5. dxc5 Bg4 6. Be2 e5 7. Ng5 Bxe2 8. Qxe2 Bxc5 9. O-O h6 10. Nf3 e4 11. Nfd2 Qd7 12. Nb3 Bd6 13. Nc3 O-O-O 14. Nb5 a6 15. Nxd6+ Qxd6 16. Bd2 h5 17. Ba5 Rde8 18. c3 h4 19. Bb4 Nxb4 20. cxb4 h3 21. gxh3 Re5 22. Rfc1+ Kb8 23. Nd4 Rg5+ 24. Kf1 Rxh3 25. b5 Rg1+ 26. Kxg1 Qxh2+ 27. Kf1 Qh1#';
const line=(pv,score,multipv)=>({pv,score,multipv,depth:16,bound:'exact'});

test('Kb8 and Rg1 retain exceptional annotations and the unique mate finish is Great',async t=>{
  const a=app(t),S=loadGame(a,pgn);S.settings.engineDepth=16;S.bests.fill(null);S.evals.fill(null);
  const data=[
    {ply:44,best:'c8b8',score:{cp:381},comparison:[line('c8b8',{cp:349},1),line('c8d8',{cp:160},2)]},
    {ply:50,best:'g5g1',score:{mate:3},comparison:[line('g5g1',{mate:3},1),line('h3h2',{cp:429},2)]},
    {ply:54,best:'h2h1',score:{mate:1},comparison:[line('h2h1',{mate:1},1),line('f6h5',{cp:-305},2)]},
  ];
  for(const d of data) S.bests[d.ply-1]={score:d.score,playedScore:d.score,bestmove:d.best,lines:[line(d.best,d.score,1)]};
  a.call('computeDerived');assert.deepEqual(Array.from(S.greatCandidates),[44,54]);
  assert.equal(a.call('_sacAt',50),true);assert.equal(S.classif[50],'brilliant');
  const original=JSON.stringify({bests:S.bests,evals:S.evals,acc:S.acc,elo:S.accElo});let checks=0;
  await a.call('verifyGreatCandidates',S,async()=>fakeEngine(async(fen,depth,count)=>{
    checks++;assert.equal(count,2);assert.equal(depth,16);const d=data.find(d=>S.positions[d.ply-1].fen===fen);
    assert.ok(d);return {bestmove:d.best,lines:d.comparison};
  }),()=>true);
  a.call('computeDerived');assert.equal(checks,2);
  assert.deepEqual(data.map(d=>S.classif[d.ply]),['great','brilliant','great']);
  assert.equal(JSON.stringify({bests:S.bests,evals:S.evals,acc:S.acc,elo:S.accElo}),original);
});

test('a position-only import can qualify for Great on its first move',async t=>{
  const a=app(t),S=loadGame(a,'[SetUp "1"]\n[FEN "7k/8/4p3/8/8/8/8/K2Q4 w - - 0 1"]\n\n1. Ka2');
  S.bests[0]={score:{cp:0},playedScore:{cp:0},bestmove:'a1a2',lines:[line('a1a2',{cp:0},1)]};
  a.call('computeDerived');assert.deepEqual(Array.from(S.greatCandidates),[1]);
  await a.call('verifyGreatCandidates',S,async()=>fakeEngine(async()=>({bestmove:'a1a2',lines:[line('a1a2',{cp:0},1),line('a1b1',{cp:-500},2)]})),()=>true);
  a.call('computeDerived');assert.equal(S.classif[1],'great');
});

test('routine recaptures remain Best even when other moves lose substantially',t=>{
  for(const [ply,move,alternative] of [[29,'b5d6','f2f3'],[30,'d7d6','c8b8'],[39,'c3b4','a2a3']]){
    const a=app(t),S=loadGame(a,pgn);
    S.bests[ply-1]={score:{cp:400},playedScore:{cp:400},bestmove:move,lines:[line(move,{cp:400},1),line(alternative,{cp:0},2)]};
    assert.equal(a.call('routineGreatMove',ply,S,false),true);
    a.call('computeDerived');assert.equal(S.classif[ply],'best');assert.equal(S.greatCandidates.includes(ply),false);
  }
});
test('an undefended queen grab is Best; sacrifice and promotion exceptions remain eligible',t=>{
  const a=app(t),S=loadGame(a,'1. e4 e5 2. Nf3 Qh4 3. Nxh4');
  S.bests[4]={score:{cp:900},playedScore:{cp:900},bestmove:'f3h4',lines:[line('f3h4',{cp:900},1),line('d2d4',{cp:0},2)]};
  a.call('computeDerived');assert.equal(S.classif[5],'best');assert.equal(a.call('routineGreatMove',5,S,false),true);
  assert.equal(a.call('routineGreatMove',5,S,true),false);
  S.positions[5]={...S.positions[5],promotion:'n'};assert.equal(a.call('routineGreatMove',5,S,false),false);
});


test('equal exchanges use their whole material balance and allow a meaningful evaluation change',t=>{
  const a=app(t),S=loadGame(a,pgn);
  assert.equal(S.positions[39].captured,'n');
  assert.equal(a.call('routineGreatMove',39,S,false),true);
  S.evals[37]={cp:0};S.evals[39]={cp:300};
  assert.equal(a.call('routineGreatMove',39,S,false),false);
  // Tiny search fluctuations are still a stable baseline.
  S.evals[39]={cp:1};assert.equal(a.call('routineGreatMove',39,S,false),true);
  // Observed Lite position-search variation still represents the same balanced trade.
  S.evals[37]={cp:-146};S.evals[39]={cp:-122};assert.equal(a.call('routineGreatMove',39,S,false),true);
});

test('a unique forced-mate sacrifice is not downgraded by a centipawn alternative crossing +5',async t=>{
  for(const [depth,alternative] of [[8,317],[12,401],[16,429],[18,569],[20,445]]){
    const a=app(t),S=loadGame(a,pgn);S.settings.engineDepth=depth;S.bests.fill(null);S.evals.fill(null);
    const top={...line('g5g1',{mate:3},1),depth};
    S.bests[49]={score:{mate:3},playedScore:{mate:3},bestmove:'g5g1',lines:[top]};a.call('computeDerived');
    await a.call('verifyGreatCandidates',S,async()=>fakeEngine(async()=>({bestmove:'g5g1',lines:[top,{...line('h3h2',{cp:alternative},2),depth}]})),()=>true);
    a.call('computeDerived');assert.equal(S.classif[50],'brilliant',`depth ${depth}`);
  }
});

test('other mating alternatives do not disqualify a sound voluntary sacrifice',t=>{
  const a=app(t),S=loadGame(a,pgn);S.settings.engineDepth=18;S.bests.fill(null);S.evals.fill(null);
  S.bests[49]={score:{mate:3},playedScore:{mate:3},bestmove:'g5g1',lines:[
    {...line('g5g1',{mate:3},1),depth:18},{...line('h3h2',{mate:5},2),depth:18},
  ]};a.call('computeDerived');assert.equal(S.classif[50],'brilliant');
  S.bests[49].lines[1].score={cp:900};a.call('computeDerived');assert.equal(S.classif[50],'brilliant');
});

test('Qxh6 queen sacrifice qualifies even when a different move also wins',t=>{
  const a=app(t),S=loadGame(a,'1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d4 exd4 6. e5 Ng8 7. Ng5 Nh6 8. Re1 O-O 9. Qd3 g6 10. Qh3 Kg7 11. Qxh6+ Kxh6 12. Nxf7+ Kg7 13. Bh6+ Kg8 14. Nxd8+ Kh8');
  S.bests.fill(null);S.evals.fill(null);
  S.bests[20]={score:{cp:868},playedScore:{cp:868},bestmove:'h3h6',lines:[line('h3h6',{cp:868},1),line('g5h7',{cp:592},2)]};
  a.call('computeDerived');assert.equal(a.call('_sacAt',21),true);assert.equal(S.classif[21],'brilliant');
});

test('Rg5 is Best when a verified alternative also keeps a clearly winning advantage',async t=>{
  const a=app(t),S=loadGame(a,pgn);S.settings.engineDepth=17;S.bests.fill(null);S.evals.fill(null);
  S.bests[45]={score:{cp:507},playedScore:{cp:507},bestmove:'e5g5',lines:[{...line('e5g5',{cp:507},1),depth:17}]};
  a.call('computeDerived');
  await a.call('verifyGreatCandidates',S,async()=>fakeEngine(async()=>({bestmove:'e5g5',lines:[
    {...line('e5g5',{cp:504},1),depth:17},{...line('e5h5',{cp:386},2),depth:17},
  ]})),()=>true);
  a.call('computeDerived');assert.equal(S.classif[46],'best');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { app, loadGame, branch } from './helpers/app.mjs';

const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6';

test('alternative ratings match mainline for both sides and retain pre-branch context', t => {
  const a = app(t);
  const scenarios = [
    [70,-20,80,50,-80,10,0].map(cp=>({cp})),
    [0,0,350,340,100,80,500].map(cp=>({cp})),
    [{cp:0},{mate:-2},{mate:-4},{cp:20},{mate:2},{mate:4},{cp:0}],
  ];
  for (const evals of scenarios) {
    const S = loadGame(a,pgn,evals);
    a.call('computeDerived');
    const expected = Array.from(S.classif);
    const originalEvals = JSON.stringify(S.evals);
    for (let ply=0;ply<S.total;ply++) {
      const v=branch(a,ply);
      a.call('classifyVariationMoves');
      assert.deepEqual(Array.from(v.positions.slice(1),p=>p.classif),expected.slice(ply+1));
      assert.equal(JSON.stringify(S.evals),originalEvals);
      assert.deepEqual(Array.from(S.classif),expected);
    }
  }
});

test('pawn thresholds are not compared to centipawns', t => {
  const a=app(t);const S=loadGame(a,'1. e4',[{cp:70},{cp:-20}]);
  a.call('computeDerived');const v=branch(a);a.call('classifyVariationMoves');
  assert.equal(S.classif[1],'inacc');assert.equal(v.positions[1].classif,'inacc');
});

test('delaying a forced mate is Good in either review mode', t => {
  const a=app(t);const S=loadGame(a,'1. e4',[{mate:2},{mate:4}]);
  a.call('computeDerived');const v=branch(a);a.call('classifyVariationMoves');
  assert.equal(S.classif[1],'good');assert.equal(v.positions[1].classif,'good');
});

test('offline theory beyond four moves remains Book; losing traps do not', t => {
  const a=app(t);
  a.context.__book=JSON.parse(fs.readFileSync(new URL('../data/book.json',import.meta.url))).epd;
  a.run('BOOK = __book');
  const S=loadGame(a,'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7');
  a.call('computeDerived');assert.equal(S.classif[10],'book');
  const v=branch(a);a.call('classifyVariationMoves');assert.equal(v.positions[10].classif,'book');
  loadGame(a,'1. f3 e5 2. g4',[{cp:0},{cp:-20},{cp:-20},{mate:-1}]);
  a.call('computeDerived');assert.notEqual(S.classif[3],'book');
  assert.ok(['mistake','blunder'].includes(S.classif[3]));
});

test('promotion identity is preserved in best-move comparison', t => {
  const a=app(t);
  const S=loadGame(a,'[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N');
  S.bests[0].bestmove='a7a8q';
  a.call('computeDerived');assert.notEqual(S.classif[1],'best');
  S.bests[0].bestmove='a7a8n';a.call('computeDerived');assert.equal(S.classif[1],'best');
});

test('missing evaluations do not invent a rating', t => {
  const a=app(t);loadGame(a,'1. e4',[{cp:0},null]);
  const v=branch(a);a.call('classifyVariationMoves');assert.equal(v.positions[1].classif,null);
});

test('terminal detection retains threefold history in variations', t => {
  const a=app(t);const S=loadGame(a,'1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8');
  assert.equal(S.positions[8].draw,'threefold');
  const v=branch(a);assert.equal(a.call('variationTerminal',v,8).cp,0);
  assert.equal(a.call('variationTerminal',v,4),null);
});

test('the current variation opening follows the viewed prefix', t => {
  const a=app(t);loadGame(a,'1. e4 e5');const v=branch(a);
  a.context.__book={
    [a.call('epdOf',v.positions[1].fen)]:['B00','King pawn'],
    [a.call('epdOf',v.positions[2].fen)]:['C20','Open game'],
  };a.run('BOOK = __book');
  assert.equal(a.call('variationOpening').name,'Open game');
  v.idx=1;assert.equal(a.call('variationOpening').name,'King pawn');
  v.idx=0;assert.equal(a.call('variationOpening'),null);
});

test('original PGN IDs remain stable and distinct', t => {
  const a=app(t);const games=['1. e4 e5 *','1. d4 d5 *','1. c4 c5 *'];
  assert.equal(new Set(games.map(p=>a.call('simpleHash',p))).size,3);
  // Known ID produced by the released implementation.
  assert.equal(a.call('simpleHash',''),'45h');
});

function greatScenario(a, color = 'w') {
  const white = color === 'w';
  const S = loadGame(a, white ? '1. e4 e5 2. Nf3' : '1. e4 e5',
    (white ? [0,0,400,400] : [0,-400,-400]).map(cp => ({cp})));
  const ply = white ? 3 : 2, played = white ? 'g1f3' : 'e7e5', alternative = white ? 'd2d4' : 'c7c5';
  S.bests[ply - 1] = {bestmove:played,lines:[
    {score:{cp:400},pv:played,depth:16,bound:'exact',multipv:1},
    {score:{cp:0},pv:alternative,depth:16,bound:'exact',multipv:2},
  ]};
  return {S,ply,played,alternative};
}

test('Great needs evidence that other replies are outside the Good band, for either side', t => {
  const a = app(t);
  for (const color of ['w','b']) {
    const {S,ply} = greatScenario(a,color);
    a.call('computeDerived'); assert.equal(S.classif[ply],'great');
    for (let start = 0; start < ply; start++) {
      const v = branch(a,start); a.call('classifyVariationMoves');
      assert.equal(v.positions[ply-start].classif,'great');
    }
    S.bests[ply-1].lines[1].score.cp = 390;
    a.call('computeDerived'); assert.equal(S.classif[ply],'best');
    S.bests[ply-1].lines.length = 1;
    a.call('computeDerived'); assert.equal(S.classif[ply],'best');
  }
});

test('stale, bounded, duplicated, illegal or metadata-free alternatives cannot certify Great', t => {
  const a = app(t);
  const edits = [
    root => {root.lines[1].depth = 15;},
    root => {root.lines[1].bound = 'upperbound';},
    root => {root.lines[0].bound = 'lowerbound';},
    root => {root.lines[1].pv = root.bestmove;},
    root => {root.lines[1].pv = 'd2d5';},
    root => {root.lines[1].multipv = 3;},
    root => {delete root.lines[0].depth;},
    root => {root.lines[1].score = {};},
    root => {root.bestmove = 'b1c3';},
  ];
  for (const edit of edits) {
    const {S,ply} = greatScenario(a); edit(S.bests[ply-1]);
    a.call('computeDerived'); assert.notEqual(S.classif[ply],'great');
  }
  const {S,ply} = greatScenario(a);
  S.bests[ply].lines = [{multipv:1,bound:'upperbound'}];
  a.call('computeDerived'); assert.notEqual(S.classif[ply],'great');
});

test('Great evidence uses the configured loss boundary and does not change evaluation scores', t => {
  const a = app(t), {S,ply} = greatScenario(a);
  S.settings.enginePath = 'nnue'; // This fixture exercises the historical calibration curve.
  a.run('CALIB.display = "winpct"');
  a.call('computeDerived');
  const scores = JSON.stringify({acc:S.acc,elo:S.accElo,perMove:S.accMove,evals:S.evals});
  a.run('CALIB.clsWp.inacc = 30');
  a.call('computeDerived'); assert.equal(S.classif[ply],'best');
  assert.equal(JSON.stringify({acc:S.acc,elo:S.accElo,perMove:S.accMove,evals:S.evals}),scores);
  a.run('CALIB.clsWp.inacc = 5');
  a.call('computeDerived'); assert.equal(S.classif[ply],'great');
});

test('mate transitions distinguish escaping defeat, delaying a win and reversing the winner', t=>{
  const a=app(t);
  const cases=[[-3,3,'excellent'],[-3,-1,'excellent'],[-3,-5,'excellent'],[3,-3,'blunder'],[3,5,'good']];
  for(const color of ['w','b'])for(const [before,after,label] of cases){
    const white=color==='w',sign=white?1:-1;
    const S=loadGame(a,white?'1. e4':'1. e4 e5',
      (white?[before,after]:[before,before,after]).map(mate=>({mate:mate*sign})));
    const ply=white?1:2;a.call('computeDerived');assert.equal(S.classif[ply],label);
    const v=branch(a);a.call('classifyVariationMoves');assert.equal(v.positions[ply].classif,label);
    if(before>0){S.bests[ply-1].bestmove=white?'e2e4':'e7e5';a.call('computeDerived');assert.equal(S.classif[ply],label);}
  }
});

test('failed-punish Miss requires giving back the clear advantage',t=>{
  const a=app(t);
  const S=loadGame(a,'1. e4 e5 2. Nf3',[0,0,2000,800].map(cp=>({cp})));
  a.call('computeDerived');assert.notEqual(S.classif[3],'miss');
  loadGame(a,'1. e4 e5 2. Nf3',[0,0,500,0].map(cp=>({cp})));
  a.call('computeDerived');assert.equal(S.classif[3],'miss');
  const v=branch(a,1);a.call('classifyVariationMoves');assert.equal(v.positions[2].classif,'miss');
});

test('a clearly winning runner-up prevents Great for either side',t=>{
  const a=app(t);
  for(const color of ['w','b']){
    const {S,ply}=greatScenario(a,color);S.bests[ply-1].lines[1].score.cp=250;
    a.call('computeDerived');assert.equal(S.classif[ply],'best');
    const v=branch(a);a.call('classifyVariationMoves');assert.equal(v.positions[ply].classif,'best');
  }
});


for(const engine of ['sf19','sf19lite'])for(const color of ['w','b'])test(engine+' '+color+': a minor disadvantage becoming forced mate is Blunder',t=>{
 const a=app(t),sign=color==='w'?1:-1;
 for(const before of [-199,-100,-20,0,100]){
  const evals=color==='w'?[{cp:before},{mate:-3}]:[{cp:before},{cp:before},{mate:-3}];
  const S=loadGame(a,color==='w'?'1. e4':'1. e4 e5',evals.map(e=>e.mate!=null?{mate:e.mate*sign}:{cp:e.cp*sign}));
  S.settings.enginePath=engine;a.call('computeDerived');const ply=color==='w'?1:2;
  assert.equal(S.classif[ply],'blunder');
  const v=branch(a);a.call('classifyVariationMoves');assert.equal(v.positions[ply].classif,'blunder');
  S.analysisMode=false;S.variation=null;
 }
});


// Authored engine scores test the general annotation policy, not a fixed mate depth claim.
for(const engine of ['sf19','sf19lite'])for(const color of ['w','b'])test(engine+' '+color+': unique mate outranks a winning non-mating alternative in review and live analysis',t=>{
 const a=app(t);
 for(const alternative of [{cp:901},{cp:2000},{mate:8},{mate:3},{mate:-3}]){
  const {S,ply}=greatScenario(a,color);S.settings.enginePath=engine;
  S.bests[ply-1].lines[0].score={mate:6};S.bests[ply-1].lines[1].score=alternative;
  S.evals[ply]={mate:color==='w'?6:-6};a.call('computeDerived');
  const expected=alternative.mate>0?'best':'great';assert.equal(S.classif[ply],expected);
  const v=branch(a);a.call('classifyVariationMoves');assert.equal(v.positions[ply].classif,expected);
  S.analysisMode=false;S.variation=null;
 }
});

for(const engine of ['sf19','sf19lite'])test(engine+': Qh5+ regression uses mate evidence rather than the +9.01 runner-up',t=>{
 const a=app(t),S=loadGame(a,'1. e4 e5 2. Nf3 f6 3. Nxe5 h6 4. Qh5+');S.settings.enginePath=engine;
 S.evals[7]={mate:6};S.bests[6]={bestmove:'d1h5',score:{mate:6},lines:[
  {score:{mate:6},pv:'d1h5',depth:17,bound:'exact',multipv:1},
  {score:{cp:901},pv:'f1c4',depth:17,bound:'exact',multipv:2},
 ]};a.call('computeDerived');assert.equal(S.classif[7],'great');
 const v=branch(a);a.call('classifyVariationMoves');assert.equal(v.positions[7].classif,'great');
 for(const edit of [r=>r.lines[1].depth--,r=>r.lines[0].bound='lowerbound',r=>r.lines[1].bound='upperbound']){
  S.analysisMode=false;S.variation=null;const original=structuredClone(S.bests[6]);edit(S.bests[6]);
  a.call('computeDerived');assert.notEqual(S.classif[7],'great');S.bests[6]=original;
 }
});

test('a unique mating capture can qualify even when routine or book filters would otherwise suppress Great',t=>{
 const a=app(t),S=loadGame(a,'[SetUp "1"]\n[FEN "5rk1/5ppp/8/6NQ/8/8/8/6K1 w - - 0 1"]\n\n1. Qxh7#');
 S.evals[1]={mate:1};S.bests[0]={bestmove:'h5h7',score:{mate:1},lines:[
  {score:{mate:1},pv:'h5h7',depth:17,bound:'exact',multipv:1},
  {score:{cp:901},pv:'h5h4',depth:17,bound:'exact',multipv:2},
 ]};a.context.__mateFen=S.positions[1].fen;a.run('BOOK = { [epdOf(__mateFen)]: ["Test", "Authored book fixture"] }');
 a.call('computeDerived');assert.equal(a.call('_isCheckmate',1),true);assert.equal(S.positions[1].captured,'p');assert.equal(S.classif[1],'great');
});

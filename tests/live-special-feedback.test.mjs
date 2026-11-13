import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../lib/chess.js';
import {app, loadGame, branch, fakeEngine, deferred, settle} from './helpers/app.mjs';

// Synthetic scores exercise refinement and cancellation, not the strength of these moves.
for (const build of ['sf19', 'sf19lite']) for (const category of ['great', 'brilliant']) {
  test(`${build}: rapid moves preserve provisional ${category}, refine it, and reject late results`, async t => {
    const a = app(t), sacrifice = category === 'brilliant';
    const S = loadGame(a, sacrifice ? '[SetUp "1"]\n[FEN "7k/8/4p3/8/8/8/8/K2Q4 w - - 0 1"]\n\n1. Qd5' : '1. Nf3');
    S.settings.enginePath = build; S.standalone = true;
    a.call('computeDerived'); a.call('buildUI');
    const v = branch(a, 0, 0), rootFen = v.positions[0].fen;
    const moves = sacrifice ? ['d1d5', 'h8h7', 'a1a2'] : ['g1f3', 'd7d5', 'g2g3'];
    const other = sacrifice ? 'd1e1' : 'g1h3';
    const line = (pv, score, multipv, depth = 4) => ({pv, score, multipv, depth, bound: 'exact'});
    const score = sacrifice ? {cp: 0} : {mate: 6};
    const early = {bestmove: moves[0], score, lines: [line(moves[0], score, 1), line(other, sacrifice ? {cp: -1} : {cp: 0}, 2)]};
    const refined = {bestmove: other, score: {cp: 0}, lines: [line(other, {cp: 0}, 1, 16), line(moves[0], {cp: -600}, 2, 16)]};
    Object.assign(v.positions[0], {best: null, eval: null, searchPreview: early});
    a.call('buildBoard');
    const jobs = new Map(), requests = [];
    const engine = fakeEngine(async (fen, depth, count, history, progress) => {
      if (fen === rootFen) return refined;
      if (jobs.has(fen)) return jobs.get(fen).result;
      const legal = new Chess(fen).moves({verbose: true});
      const result = {bestmove: legal[0].lan, score: {cp: 0}, lines: legal.slice(0, 2).map((m, i) => line(m.lan, {cp: 0}, i + 1))};
      const done = deferred(); jobs.set(fen, {done, result});
      progress(result); return done.promise;
    });
    engine.buildKey = build; S.liveEngine = engine;
    const request = a.run('requestLiveEval');
    a.replace('requestLiveEval', () => { const pending = request(); requests.push(pending); return pending; });
    for (const [index, move] of moves.entries()) {
      a.call('applyUserMove', move.slice(0, 2), move.slice(2), false); await settle();
      assert.equal(v.positions[1].classif, category);
      assert.ok(a.dom.window.document.querySelector('.ip-live-status'));
      if (index === 0) assert.equal(a.dom.window.document.querySelector('.sq-badge').dataset.category, category);
    }
    const current = jobs.get(v.positions[3].fen); current.done.resolve(current.result);
    await requests[2];
    assert.equal(v.positions[1].classif, 'blunder');
    assert.equal(a.dom.window.document.querySelector('[data-var="1"]').dataset.class, 'blunder');
    for (const job of jobs.values()) job.done.resolve(job.result);
    await Promise.all(requests);
    assert.equal(v.positions[1].classif, 'blunder');
    assert.equal(a.dom.window.document.querySelector('.sq-badge')?.dataset.move, v.positions[3].fen);
    assert.equal(a.dom.window.document.querySelector('.ip-live-status'), null);
  });
}

for (const build of ['sf19', 'sf19lite']) test(`${build}: shallow history backfill cannot replace deeper played-move evidence`, t => {
  const a = app(t), S = loadGame(a, '[SetUp "1"]\n[FEN "7k/8/4p3/8/8/8/8/K2Q4 w - - 0 1"]\n\n1. Qd5');
  S.settings.enginePath = build;
  S.bests[0] = {bestmove: 'd1e1', score: {cp: 500}, lines: [
    {multipv: 1, depth: 4, bound: 'exact', pv: 'd1e1', score: {cp: 500}},
    {multipv: 2, depth: 4, bound: 'exact', pv: 'd1d5', score: {cp: 0}},
  ]};
  S.bests[1] = {bestmove: 'e6d5', score: {cp: -800}, lines: [
    {multipv: 1, depth: 16, bound: 'exact', pv: 'e6d5', score: {cp: -800}},
  ]};
  const v = branch(a);
  a.call('classifyVariationMoves'); assert.equal(v.positions[1].classif, 'brilliant');
  const continuation = v.positions[1].best.lines[0];
  for (const [depth, bound, pv] of [[4, 'exact', 'e6d5'], [16, 'lowerbound', 'e6d5'], [16, 'exact', 'h8h7']]) {
    Object.assign(continuation, {depth, bound, pv});
    a.call('classifyVariationMoves'); assert.equal(v.positions[1].classif, 'blunder');
  }
  Object.assign(continuation, {depth: 16, bound: 'exact', pv: 'e6d5'});
  for (const [mate, expected] of [[-3, 4], [3, -3]]) {
    continuation.score = {mate};
    const state = a.call('classifyVariationMoves');
    assert.equal(state.annotationEvidence[1].played.mate, expected);
  }
  Object.assign(v.positions[0].best, {bestmove: 'd1d5', score: {mate: 3}, lines: [
    {multipv: 1, depth: 4, bound: 'exact', pv: 'd1d5', score: {mate: 3}},
    {multipv: 2, depth: 4, bound: 'exact', pv: 'd1e1', score: {cp: 0}},
  ]});
  continuation.score = {mate: -4};
  const state = a.call('classifyVariationMoves');
  assert.equal(state.annotationEvidence[1].best.mate, 5);
  assert.equal(v.positions[1].classif, 'brilliant', 'a deeper mate distance must not turn the best move into its own worse alternative');
});

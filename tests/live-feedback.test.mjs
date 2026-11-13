import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../lib/chess.js';
import {app, loadGame, branch, fakeEngine, deferred, settle} from './helpers/app.mjs';

for (const build of ['sf19', 'sf19lite']) test(`${build}: current move streams feedback before older searches and refines it`, async t => {
  const a = app(t), S = loadGame(a, '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
  S.settings.enginePath = build; S.standalone = true;
  a.call('computeDerived'); a.call('buildUI');
  const v = branch(a, 0, 6);
  for (const node of v.positions) { node.best = null; node.eval = null; }
  const root = deferred(), after = deferred(), calls = [];
  const line = (pv, cp, multipv, depth) => ({pv, score: {cp}, multipv, depth, bound: 'exact'});
  const early = {bestmove: 'a7a6', score: {cp: 0}, lines: [line('a7a6', 0, 1, 4), line('g8f6', -1, 2, 4)]};
  const refined = {bestmove: 'g8f6', score: {cp: 0}, lines: [line('g8f6', 0, 1, 16), line('a7a6', -600, 2, 16)]};
  const engine = fakeEngine(async (fen, depth, count, history, progress) => {
    calls.push(fen);
    if (fen === v.positions[5].fen) { progress(early); return root.promise; }
    if (fen === v.positions[6].fen) return after.promise;
    const moves = new Chess(fen).moves({verbose: true});
    return {bestmove: moves[0].lan, score: {cp: 0}, lines: moves.slice(0, 2).map((m, i) => line(m.lan, 0, i + 1, depth))};
  });
  engine.buildKey = build; S.liveEngine = engine;
  const pending = a.call('requestLiveEval'); await settle();
  assert.deepEqual(calls, [v.positions[5].fen]);
  assert.equal(v.positions[6].classif, 'best');
  assert.equal(v.positions[6].eval, null);
  assert.equal(v.positions[5].best, null);
  assert.ok(a.dom.window.document.querySelector('.ip-badge'));
  assert.equal(a.dom.window.document.querySelector('.ip-live-status').textContent, 'Provisional');
  assert.equal(a.run('liveEvalCache.size'), 0);
  root.resolve(refined); await settle();
  assert.deepEqual(calls, [v.positions[5].fen, v.positions[6].fen]);
  assert.equal(v.positions[6].classif, 'blunder');
  after.resolve({bestmove: 'b5c6', score: {cp: 600}, lines: [line('b5c6', 600, 1, 16)]});
  await pending;
  assert.deepEqual(calls, [5, 6, 4, 3, 2].map(i => v.positions[i].fen));
  assert.equal(v.positions[6].classif, 'blunder');
  assert.equal(a.dom.window.document.querySelector('.ip-live-status'), null);
});

for (const build of ['sf19', 'sf19lite']) test(`${build}: moves outside the parent candidates get feedback from the child stream`, async t => {
  const a = app(t), S = loadGame(a, '1. a3');
  S.settings.enginePath = build; S.standalone = true;
  a.call('computeDerived'); a.call('buildUI');
  const v = branch(a, 0, 1), done = deferred();
  v.positions[0].best = {bestmove: 'e2e4', score: {cp: 0}, lines: [
    {multipv: 1, depth: 16, bound: 'exact', pv: 'e2e4', score: {cp: 0}},
    {multipv: 2, depth: 16, bound: 'exact', pv: 'd2d4', score: {cp: 0}},
  ]};
  v.positions[1].best = null; v.positions[1].eval = null;
  const result = {bestmove: 'e7e5', score: {cp: 600}, lines: [{multipv: 1, depth: 4, bound: 'exact', pv: 'e7e5', score: {cp: 600}}]};
  let searches = 0;
  const engine = fakeEngine(async (fen, depth, count, history, progress) => {
    searches++; assert.equal(fen, v.positions[1].fen); progress(result); return done.promise;
  });
  engine.buildKey = build; S.liveEngine = engine;
  const pending = a.call('requestLiveEval'); await settle();
  assert.equal(v.positions[1].classif, 'blunder');
  assert.ok(a.dom.window.document.querySelector('.ip-live-status'));
  done.resolve(result); await pending;
  assert.equal(searches, 1);
  assert.equal(a.dom.window.document.querySelector('.ip-live-status'), null);
});

for (const build of ['sf19', 'sf19lite']) test(`${build}: moving during analysis retains the before preview and searches the new board first`, async t => {
  const a = app(t), S = loadGame(a, '1. e4');
  S.settings.enginePath = build; S.standalone = true;
  a.call('computeDerived'); a.call('buildUI');
  const v = branch(a, 0, 0); v.positions[0].best = null; v.positions[0].eval = null;
  const before = deferred(), current = deferred(), calls = [];
  const line = (pv, cp, multipv) => ({pv, score: {cp}, multipv, depth: 4, bound: 'exact'});
  const root = {bestmove: 'e2e4', score: {cp: 0}, lines: [line('e2e4', 0, 1), line('d2d4', -1, 2)]};
  const child = {bestmove: 'e7e5', score: {cp: 400}, lines: [line('e7e5', 400, 1), line('d7d5', 399, 2)]};
  const engine = fakeEngine(async (fen, depth, count, history, progress) => {
    calls.push(fen);
    if (calls.length === 1) { progress(root); return before.promise; }
    if (calls.length === 2) { progress(child); return current.promise; }
    return root;
  });
  engine.buildKey = build; S.liveEngine = engine;
  const first = a.call('requestLiveEval'); await settle();
  let second; const request = a.run('requestLiveEval');
  a.replace('requestLiveEval', () => second = request());
  a.call('applyUserMove', 'a2', 'a3', false); await settle();
  assert.deepEqual(calls, [v.positions[0].fen, v.positions[1].fen]);
  assert.equal(v.positions[1].classif, 'blunder');
  assert.ok(v.positions[0].searchPreview);
  assert.ok(a.dom.window.document.querySelector('.ip-live-status'));
  before.resolve(root); await first;
  assert.ok(v.positions[0].searchPreview, 'the canceled request must not erase reused evidence');
  current.resolve(child); await second;
  assert.equal(v.positions[1].classif, 'blunder');
  assert.equal(v.positions[0].searchPreview, null);
  assert.equal(a.dom.window.document.querySelector('.ip-live-status'), null);
});

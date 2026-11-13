import test from 'node:test';
import assert from 'node:assert/strict';
import {app, loadGame, branch} from './helpers/app.mjs';

const pgn = '1. e4 e5 2. Nf3 h6 3. Bc4 d6 4. d4 exd4 5. c3 dxc3 6. Bxf7+ Kxf7 7. Ne5+ Kf6 8. Qf3+ Kxe5 9. Qf7 Nf6 10. f4+ Kd4 11. Nxc3 Nc6 12. Ne2+';
for (const build of ['sf19', 'sf19lite']) for (const previous of [{mate: 20}, {cp: 912}]) {
  test(`${build}: a verified faster mate replaces stale ${JSON.stringify(previous)} candidate evidence`, t => {
    const a = app(t), S = loadGame(a, pgn); S.settings.enginePath = build;
    const i = S.total;
    S.bests[i - 1] = {bestmove: 'f7b3', score: {mate: 13}, lines: [
      {multipv: 1, depth: 16, bound: 'exact', pv: 'f7b3', score: {mate: 13}},
      {multipv: 2, depth: 16, bound: 'exact', pv: 'c3e2', score: previous},
    ]};
    S.bests[i] = {bestmove: 'd4c5', score: {mate: -7}, lines: [
      {multipv: 1, depth: 16, bound: 'exact', pv: 'd4c5', score: {mate: -7}},
    ]};
    S.evals[i] = {mate: 7};
    const v = branch(a), state = a.call('classifyVariationMoves');
    assert.equal(state.annotationEvidence[i].played.mate, 8);
    assert.equal(v.positions[i].classif, 'best');
    assert.deepEqual(S.bests[i - 1].lines[1].score, previous);
    for (const [depth, bound] of [[15, 'exact'], [16, 'lowerbound']]) {
      Object.assign(v.positions[i].best.lines[0], {depth, bound});
      a.call('classifyVariationMoves'); assert.notEqual(v.positions[i].classif, 'best');
    }
  });
}

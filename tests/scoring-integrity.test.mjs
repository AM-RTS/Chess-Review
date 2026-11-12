import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Chess} from '../lib/chess.js';
import {calibratedReview, scoringEvidenceComplete} from '../lib/calibrated-review.js';
import {app, loadGame} from './helpers/app.mjs';

const calibration = JSON.parse(await readFile(new URL('../data/calibration.json', import.meta.url)));
// Archived protocol fixtures; current shared-search models have dedicated tests.
delete calibration.twoLineRatings;
// Authored legal opening sequence, not a sampled game or human-quality label.
const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3';
function fixture(build) {
  const chess = new Chess(); chess.loadPgn(pgn);
  const moves = chess.history({verbose: true}), replay = new Chess();
  const positions = [{fen: replay.fen()}];
  for (const move of moves) {
    replay.move({from: move.from, to: move.to, promotion: move.promotion});
    positions.push({...move, fen: replay.fen()});
  }
  const engine = build === 'nnue' ? 'sf18' : 'sf19';
  const bests = moves.map(() => ({bestmove: 'different', score: {cp: 200}, playedScore: {cp: -200},
    calibration: {version: calibration.version, build, nodes: build === 'sf19lite' ? 20000 : null,
      qualityVersion: build === 'nnue' ? calibration.quality.candidateVersion : null},
    ratingEvidence: {candidateVersion: calibration.movesOnly[engine].candidateVersion,
      best: {wdl: [400, 400, 200]}, played: {wdl: [200, 400, 400]}, bestmove: 'different'}}));
  return {positions, bests};
}
const review = ({positions, bests}, mode = 'moves') => calibratedReview(positions, bests, calibration, {}, mode);

for (const build of ['nnue', 'sf19lite']) for (const color of ['w', 'b']) {
  test(`${build} ${color}: an invalid decision cannot silently improve whole-game accuracy`, () => {
    for (const mutate of [
      root => {delete root.playedScore;},
      root => {root.playedScore = {cp: NaN};},
      root => {root.score = {cp: Infinity};},
      root => {root.playedScore = {mate: 0};},
      root => {root.playedScore = {mate: 1.5};},
      root => {root.calibration.version = 'stale';},
    ]) {
      const data = fixture(build);
      const index = color === 'w' ? 0 : 1, other = color === 'w' ? 'b' : 'w';
      data.bests[index].playedScore = {cp: -1500};
      const before = review(data);
      assert.ok(Number.isFinite(before[color].accuracy));
      mutate(data.bests[index]);
      const after = review(data);
      assert.equal(after[color].complete, false);
      assert.equal(after[color].accuracy, null);
      assert.equal(after[other].accuracy, before[other].accuracy);
      assert.equal(after[color].moves.length, before[color].moves.length - 1);
    }
  });


}



test('cache admission rejects malformed scores, sparse roots and mixed engines', () => {
  for (const build of ['nnue', 'sf19lite']) {
    const valid = fixture(build).bests, total = valid.length;
    assert.equal(scoringEvidenceComplete(valid, total, calibration), true);
    for (const score of [{}, {cp: null}, {cp: NaN}, {cp: Infinity}, {mate: 0}, {mate: .5}]) {
      for (const key of ['score', 'playedScore']) {
        const roots = structuredClone(valid); roots[0][key] = score;
        assert.equal(scoringEvidenceComplete(roots, total, calibration), false);
      }
    }
    for (const mutate of [
      roots => {delete roots[0];},
      roots => {roots[0].calibration.version = 'stale';},
      roots => {roots[0].calibration.build = 'unknown';},
      roots => {roots[0] = fixture(build === 'nnue' ? 'sf19lite' : 'nnue').bests[0];},
      ...(build === 'sf19lite' ? [roots => {roots[0].calibration.nodes = 80000;}] : []),
    ]) {
      const roots = structuredClone(valid); mutate(roots);
      assert.equal(scoringEvidenceComplete(roots, total, calibration), false);
    }
    for (const score of [{cp: 0}, {cp: -100}, {mate: 1}, {mate: -3}]) {
      const roots = structuredClone(valid); roots[0].playedScore = score;
      assert.equal(scoringEvidenceComplete(roots, total, calibration), true);
    }
  }
});

test('valid cached custom SF18 settings remain restorable and invalid observations trigger reanalysis', t => {
  const a = app(t), S = loadGame(a, pgn), data = fixture('nnue');
  S.bests = [...data.bests, {score: {cp: 0}, bestmove: null}];
  for (const root of data.bests) root.calibration.qualityVersion = null;
  const saved = {pgn: S.pgn, settingsKey: a.call('analysisSettingsKey'), bests: S.bests, evals: S.evals};
  assert.equal(a.call('canRestoreAnalysis', saved), true);
  saved.bests[0].playedScore = {mate: 0};
  assert.equal(a.call('canRestoreAnalysis', saved), false);
});

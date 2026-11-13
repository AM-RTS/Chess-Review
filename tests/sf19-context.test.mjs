import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Chess} from '../lib/chess.js';
import {calibratedReview} from '../lib/calibrated-review.js';
import {contextualRating, movesOnlyRating, ratingGameQuality} from '../tools/calibration/rating-scoring.mjs';
import {fitSf19Context} from '../tools/calibration/sf19-context.mjs';
import {app, loadGame} from './helpers/app.mjs';

const calibration = JSON.parse(await readFile(new URL('../tools/calibration/public/calibration.json', import.meta.url)));
// Frozen public one-line protocol replay, separate from current two-line model tests.
delete calibration.twoLineRatings;
const evidence = JSON.parse(gunzipSync(await readFile(new URL('../tools/calibration/public/sf19-rating-evidence.json.gz', import.meta.url))));
const dataset = JSON.parse(gunzipSync(await readFile(new URL('../tools/calibration/public/dataset.json.gz', import.meta.url))));

function fixture(t, pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3') {
  const a = app(t), S = loadGame(a, pgn);
  S.players = {w: {rating: 1500}, b: {rating: 1800}};
  S.bests = S.positions.slice(1).map(() => ({bestmove: 'different', score: {cp: 80}, playedScore: {cp: -80},
    calibration: {version: calibration.version, build: 'sf19lite', nodes: 20000, contextVersion: calibration.context.sf19.candidateVersion},
    ratingEvidence: {candidateVersion: calibration.movesOnly.sf19.candidateVersion,
      best: {wdl: [400, 400, 200]}, played: {wdl: [200, 400, 400]}, bestmove: 'different'}}));
  return S;
}
const review = (S, mode = 'context') => calibratedReview(S.positions, S.bests, calibration, S.players, mode);





test('contextual WDL quality excludes forced dilution and rejects incomplete numerical evidence', () => {
  assert.equal(ratingGameQuality([{eligible: true, loss: .25}, {eligible: false, loss: 0}]), 75);
  assert.equal(ratingGameQuality([{eligible: true, loss: 0}]), 100);
  assert.equal(ratingGameQuality([]), null);
  assert.throws(() => ratingGameQuality([{eligible: true, loss: NaN}]), /evidence/);
  assert.throws(() => ratingGameQuality([{eligible: true, loss: 1.1}]), /evidence/);
});



test('SF19 public peers reconstruct exactly and improve game-separated distribution error over baseline', () => {
  assert.deepEqual(fitSf19Context(evidence), calibration.context.sf19);
  const metrics = calibration.context.sf19.developmentValidation;
  assert.equal(metrics.games, 750); assert.equal(metrics.sides, 1498);
  assert.ok(metrics.crps < metrics.baselineCrps);
  const peers = new Map(calibration.context.sf19.model.peers.map(row => [row.gameId + ':' + row.color, row]));
  for (const row of evidence.rows) {
    const eligible = row.contextMoves.filter(move => move.eligible);
    const quality = eligible.reduce((sum, move) => sum + move.quality, 0) / eligible.length;
    assert.ok(Math.abs(peers.get(row.gameId + ':' + row.color).quality - quality) < 1e-12);
  }
  assert.throws(() => fitSf19Context({...evidence, rows: evidence.rows.map(row => ({...row, split: 'validation'}))}), /training/);
  assert.throws(() => fitSf19Context({...evidence, engineConfig: {...evidence.engineConfig, majorVersion: 18}}), /protocol/);
});

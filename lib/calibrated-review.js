import {Chess} from './chess.js';
import {publicMoveQuality, publicGameAccuracy, sf19MoveQuality, sf19GameAccuracy} from './public-scoring.js';

const legalCounts = new WeakMap();
const scoringBuilds = new Set(['nnue', 'sf19', 'sf19lite']);
function currentProtocol(tag, calibration) {
  return !!calibration?.version && tag?.version === calibration.version
    && scoringBuilds.has(tag.build) && (tag.build !== 'sf19lite' || tag.nodes === 20000);
}
function validScore(score) {
  return score?.mate != null ? Number.isInteger(score.mate) && score.mate !== 0 : Number.isFinite(score?.cp);
}
function legalCount(position) {
  const previous = legalCounts.get(position);
  if (previous?.fen === position.fen) return previous.count;
  const count = new Chess(position.fen).moves().length;
  legalCounts.set(position, {fen: position.fen, count});
  return count;
}

export function calibratedReview(positions, bests, calibration) {
  const result = {w: {moves: []}, b: {moves: []}};
  for (let i = 1; i < positions.length; i++) {
    const position = positions[i], root = bests[i - 1], tag = root?.calibration;
    const side = result[position.color];
    if (!side) throw Error('Missing mover color');
    const played = position.from + position.to + (position.promotion || '');
    const top = root?.bestmove === played, actual = top ? root?.score : root?.playedScore;
    const legalChoices = legalCount(positions[i - 1]), forced = legalChoices === 1;
    const protocol = currentProtocol(tag, calibration);
    const valid = protocol && actual;
    const depthModel = valid && tag.build === 'nnue' && tag.qualityVersion === calibration?.quality?.candidateVersion;
    let decision = null;
    try {
      if (depthModel) decision = publicMoveQuality(root.score, actual, calibration.quality, {top, forced});
      else if (valid && (tag.build === 'sf19' || (tag.build === 'sf19lite' && tag.nodes === 20000))) {
        decision = sf19MoveQuality(root.score, actual, {top, forced});
      }
    } catch { /* A missing/ambiguous observation contributes no numerical score. */ }
    if (decision) side.moves.push({ply: i, engine: tag.build, ...decision});
  }
  for (const color of ['w', 'b']) {
    const side = result[color], total = positions.slice(1).filter(p => p.color === color).length;
    const engines = new Set(side.moves.map(move => move.engine));
    side.decisions = side.moves.filter(m => m.eligible).length;
    side.complete = side.moves.length === total;
    // Missing decisions must not silently turn an excerpt into whole-game accuracy.
    side.accuracy = !side.complete || engines.size > 1 ? null
      : (engines.has('sf19') || engines.has('sf19lite')) ? sf19GameAccuracy(side.moves) : publicGameAccuracy(side.moves);
  }
  return result;
}

export function scoringEvidenceComplete(bests, total, calibration) {
  if (!Array.isArray(bests) || !Number.isSafeInteger(total) || total < 0 || bests.length < total) return false;
  let build = null;
  for (let i = 0; i < total; i++) {
    const root = bests[i], tag = root?.calibration;
    if (!currentProtocol(tag, calibration) || !validScore(root.score) || !validScore(root.playedScore)
        || (build && tag.build !== build)) return false;
    build = tag.build;
  }
  return true;
}

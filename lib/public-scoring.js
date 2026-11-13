// Pure scoring definitions shared by the review UI and public reproduction.
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function expectedPoints(score, outcome) {
  if (!Number.isFinite(outcome?.slopePerPawn) || outcome.slopePerPawn <= 0) throw Error("Invalid outcome curve");
  if (score?.mate != null) {
    if (!Number.isInteger(score.mate) || score.mate === 0) throw Error("Ambiguous mate score");
    return score.mate > 0 ? 1 : 0;
  }
  if (!Number.isFinite(score?.cp)) throw Error("Missing engine score");
  const x = outcome.slopePerPawn * score.cp / 100;
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

export function publicMoveQuality(best, played, model, { forced = false, top = false } = {}) {
  const residual = expectedPoints(best, model.outcome) - expectedPoints(played, model.outcome);
  if (!Number.isFinite(model.choice?.temperature) || model.choice.temperature <= 0) throw Error("Invalid choice curve");
  const loss = forced || top ? 0 : Math.max(0, residual);
  return { quality: 100 * Math.exp(-model.choice.temperature * loss), loss, residual, eligible: !forced };
}

export function publicGameAccuracy(moves) {
  return mean(moves.filter(move => move.eligible).map(move => move.quality));
}

// SF19 display estimate: Lichess's public centipawn curve and move transform,
// including its one-point search uncertainty bonus. This is separate from the
// fitted historical SF18 accuracy model. https://lichess.org/page/accuracy
export const SF19_OUTCOME = Object.freeze({slopePerPawn: .368208});
export function sf19MoveQuality(best, played, {forced = false, top = false} = {}) {
  const residual = expectedPoints(best, SF19_OUTCOME) - expectedPoints(played, SF19_OUTCOME);
  const loss = forced || top ? 0 : Math.max(0, residual);
  const quality = loss === 0 ? 100 : Math.max(0, Math.min(100,
    103.1668100711649 * Math.exp(-4.354415386753951 * loss) - 3.166924740191411 + 1));
  return {quality, loss, residual, eligible: !forced};
}

// Combine ordinary and harmonic means so one disastrous decision cannot be
// hidden by a long run of easy moves. We do not use Lichess's volatility weights.
export function sf19GameAccuracy(moves) {
  const qualities = moves.filter(move => move.eligible).map(move => move.quality);
  if (!qualities.length) return null;
  if (qualities.some(value => !Number.isFinite(value) || value < 0 || value > 100)) throw Error('Invalid move quality');
  const harmonic = qualities.includes(0) ? 0 : qualities.length / qualities.reduce((sum, value) => sum + 1 / value, 0);
  return Math.max(0, Math.min(100, (mean(qualities) + harmonic) / 2));
}

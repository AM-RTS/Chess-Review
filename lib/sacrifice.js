// Board-only sacrifice evidence; no UI or engine state.
// Adapted from Brilliant-Chess (MIT); see THIRD_PARTY_NOTICES.md.
import {Chess} from "./chess.js";

export const SAC_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function _opp(c) { return c === "w" ? "b" : "w"; }
// Material gain available to the side to move through captures on one square. Enumerating legal
// moves handles pins, king safety, x-rays and promotion recaptures. This is bounded local exchange
// evidence, not a tactical engine: checks/intermediate moves elsewhere belong to the engine eval.
// A side can stop exchanging only when a legal move outside this capture sequence exists.
export function exchangeGain(chess, square, budget) {
  // Capture trees can reach the same board in different orders. Reuse only completed results;
  // never memoize unknown/exhausted branches. Clock counters do not affect local material gain.
  const memo = budget.memo || (budget.memo = new Map());
  const key = chess.fen().split(" ").slice(0, 4).join(" ") + ":" + square;
  if (memo.has(key)) return memo.get(key);
  if (++budget.nodes > budget.maxNodes) return null;
  if (!chess.get(square) || !chess.attackers(square, chess.turn()).length) { memo.set(key, 0); return 0; }
  const legal = chess.moves({ verbose: true });
  const captures = legal.filter(m => m.to === square && m.captured);
  if (!captures.length) { memo.set(key, 0); return 0; }
  let best = legal.length > captures.length ? 0 : -Infinity;
  for (const m of captures) {
    const reply = exchangeGain(new Chess(m.after), square, budget);
    if (reply == null) return null;
    const promotion = m.promotion ? SAC_VAL[m.promotion] - SAC_VAL.p : 0;
    best = Math.max(best, SAC_VAL[m.captured] + promotion - reply);
  }
  memo.set(key, best);
  return best;
}
// An attacked piece is voluntary only if some legal move could avoid its material loss. This
// includes moving it, removing the attacker, adding a defender, or an equal-value exchange.
function couldBeSaved(chess, square, color, budget = { nodes: 0, maxNodes: 128 }) {
  const piece = chess.get(square);
  if (!piece || piece.color !== color) return false;
  const legal = chess.moves({ verbose: true });
  if (!chess.attackers(square, _opp(color)).length && legal.some(m => m.from !== square)) return true;
  for (const m of legal.sort((a, b) => Number(a.from !== square) - Number(b.from !== square))) {
    const after = new Chess(m.after), to = m.from === square ? m.to : square;
    if (after.get(to)?.color !== color) continue;
    const gain = exchangeGain(after, to, budget);
    if (gain == null) return false;
    if (gain <= (SAC_VAL[m.captured] || 0)) return true;
  }
  return false;
}
// A voluntary offer of a non-pawn piece with a strictly positive local material cost. Material
// captured by the played move is credited first, so equal/profitable trades do not count. A rook
// for a minor and pawn can still count (one pawn net); there is no fitted sacrifice-size threshold.
// The opponent need not accept the offer in the game. Budget exhaustion withholds the annotation.
export function isSacrifice(move) {
  let after, before;
  try { after = new Chess(move.after); before = new Chess(move.before); } catch { return false; }
  if (before.turn() !== move.color || after.turn() !== _opp(move.color)) return false;
  const budget = { nodes: 0, maxNodes: 128 };
  const captured = (SAC_VAL[move.captured] || 0) + (move.promotion ? SAC_VAL[move.promotion] - SAC_VAL.p : 0);
  let priorThreats = null;
  const targets = after.board().flat().filter(p => p && p.color === move.color
    && ["n", "b", "r", "q"].includes(p.type) && after.attackers(p.square, _opp(move.color)).length);
  for (const piece of targets) {
    const square = piece.square;
    const same = before.get(square)?.color === piece.color && before.get(square)?.type === piece.type;
    const source = same ? square : move.from;
    // Do not treat a newly promoted piece or an ambiguous relocated rook as an existing offer.
    if (before.get(source)?.color !== piece.color || before.get(source)?.type !== piece.type) continue;
    const gain = exchangeGain(after, square, budget);
    if (gain == null) return false;
    if (gain <= captured) continue;
    if (same) {
      // A quiet move does not sacrifice an unrelated piece that was already hanging. Compare
      // legal capture consequences, since removing a pin/defender can create a genuine offer.
      // The hypothetical opponent turn has no en-passant right from its own preceding move.
      if (!priorThreats) {
        const fields = before.fen().split(" "); fields[1] = _opp(move.color); fields[3] = "-";
        priorThreats = new Chess(fields.join(" "));
      }
      const previousGain = exchangeGain(priorThreats, square, budget);
      if (previousGain == null) return false;
      // A new check changes the opponent's response obligation. An accepted offer must still
      // be a legal check evasion, as established by exchangeGain after the played move.
      if (gain - captured <= previousGain && !after.isCheck()) {
        // Ignoring a NEW opponent threat can be a tempo sacrifice. History distinguishes that
        // choice from inheriting an offer already present after the mover's previous turn.
        let earlier;
        try { if (move.prior) earlier = new Chess(move.prior); } catch {}
        if (!earlier || earlier.turn() !== _opp(move.color)
          || earlier.get(square)?.color !== piece.color || earlier.get(square)?.type !== piece.type) continue;
        const earlierGain = exchangeGain(earlier, square, budget);
        if (earlierGain == null) return false;
        if (previousGain <= earlierGain) continue;
      }
    }
    if (couldBeSaved(before, source, move.color, budget)) return true;
  }
  return false;
}

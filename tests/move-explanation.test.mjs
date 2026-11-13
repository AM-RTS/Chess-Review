import test from 'node:test';
import assert from 'node:assert/strict';
import {app, loadGame, branch} from './helpers/app.mjs';
import {conceptKey} from '../lib/concepts/session.js';

test('move card reuses selected findings and drops stale explanations', t => {
  const a = app(t), S = loadGame(a, '1. e4 e5 2. Nf3');
  S.idx = 1; S.settings.conceptsEnabled = true;
  a.replace('refreshConcepts', () => {});
  a.replace('typeWrite', (node, text) => { node.textContent = text; });
  a.call('computeDerived'); a.call('buildUI');
  const entries = new Map();
  a.context.__session = {entries}; a.run('_conceptSession = __session');
  const key = conceptKey(a.call('selectedConceptInput'));
  entries.set(key, {findings: [{event: 'forced-mate', text: 'Forced mate.', scopes: [],
    context: {evidence: {mateIn: 3}}}], status: 'complete'});
  assert.equal(a.call('selectedMoveExplanation'), 'White can now force mate in 3.');
  a.call('renderReview');
  assert.equal(a.dom.window.document.querySelector('.ip-text').textContent, 'White can now force mate in 3.');
  S.idx = 2;
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
  S.idx = 1; S.settings.conceptsEnabled = false;
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
});

test('quiet lines abstain, and mate evidence works in reviews and variations', t => {
  const a = app(t), S = loadGame(a, '1. e4 e5');
  S.idx = 1; S.bests[0].bestmove = 'e2e4';
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
  S.bests[0].bestmove = 'd2d4';
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
  branch(a, 0, 1);
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
  S.variation.positions[1].eval = {mate: -4};
  assert.equal(a.call('selectedMoveExplanation'), 'Black can now force mate in 4.');
  S.variation.idx = 2;
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
});

test('long conditional findings are not cut into unsupported claims', t => {
  const a = app(t), S = loadGame(a, '1. e4');
  S.idx = 1; S.settings.conceptsEnabled = true;
  const entries = new Map();
  a.context.__session = {entries}; a.run('_conceptSession = __session');
  entries.set(conceptKey(a.call('selectedConceptInput')), {findings: [{event: 'saving-piece',
    text: 'If ' + 'the opponent changes the position, '.repeat(10) + 'the capture is not guaranteed.'}]});
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
});

test('top line counts net material, including the played capture and recaptures', t => {
  const a = app(t), S = loadGame(a, '1. e4 d5 2. exd5');
  S.idx = 3;
  S.evals[3] = {cp: 100};
  S.bests[3].lines = [{multipv: 1, pv: 'g8f6'}];
  assert.equal(a.call('selectedMoveExplanation'), 'White gains 1 point of material.');
  branch(a, 0, 3);
  assert.equal(a.call('selectedMoveExplanation'), 'White gains 1 point of material.');
  S.variation.positions[3].best.lines[0].pv = 'd8d5';
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
  S.variation.positions[3].best.lines[0].pv = 'd8d5 a1a8';
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
});

test('material losses come only from the top line, never another candidate', t => {
  const a = app(t), S = loadGame(a, '1. e4 e5 2. Qh5');
  S.idx = 3;
  S.evals[3] = {cp: -800};
  S.bests[3].lines = [{multipv: 2, pv: 'g8f6'}, {multipv: 1, pv: 'b8c6 h5e5 c6e5'}];
  assert.equal(a.call('selectedMoveExplanation'), 'Black gains 8 points of material.');
  S.bests[3].lines[1].pv = 'b8c6';
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
});

test('a balanced opening evaluation does not explain a truncated capture as a gain', t => {
  const a = app(t), S = loadGame(a, '1. e4 e5');
  S.idx = 2; S.evals[2] = {cp: 30};
  S.bests[2].lines = [{multipv: 1, pv: 'f1a6 b7a6'}];
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
  branch(a, 0, 2);
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
});

test('top line identifies mate and concrete draws instead of material gains', t => {
  const a = app(t), S = loadGame(a, '1. e4');
  S.idx = 1;
  for (const [fen, pv, text] of [
    ['7k/5K2/8/6Q1/8/8/8/8 w - - 0 1', 'g5g6', 'Leads to stalemate.'],
    ['7k/8/5KQ1/8/8/8/8/8 w - - 0 1', 'g6g7', 'White checkmates.'],
    ['7k/8/8/8/8/2K5/1r6/2B5 w - - 0 1', 'c1b2', 'Leads to a draw by insufficient material.'],
    ['7k/8/8/8/8/2K5/8/R7 w - - 99 1', 'a1a2', 'Reaches the fifty-move rule; a draw can be claimed.'],
  ]) {
    S.positions[1].fen = fen;
    S.bests[1].lines = [{multipv: 1, pv}];
    assert.equal(a.call('selectedMoveExplanation'), text);
  }
});

test('an equal evaluation is not evidence of a draw', t => {
  const a = app(t), S = loadGame(a, '1. e4');
  S.idx = 1;
  S.bests[1].lines = [{multipv: 1, pv: 'e7e5', score: {cp: 0}}];
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
});

test('top-line repetition and perpetual check lead to a draw in both views', t => {
  const a = app(t), S = loadGame(a, '1. Nf3');
  S.idx = 1;
  const cycle = 'g8f6 f3g1 f6g8 g1f3';
  S.bests[1].lines = [{multipv: 1, pv: cycle}];
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
  S.bests[1].lines[0].pv = `${cycle} ${cycle} b8c6`;
  assert.equal(a.call('selectedMoveExplanation'), 'Leads to a draw.');
  branch(a, 0, 1);
  assert.equal(a.call('selectedMoveExplanation'), 'Leads to a draw.');
  S.variation.positions[1].fen = '7k/5Q2/8/8/8/8/8/K7 w - - 0 1';
  const checks = 'f7f8 h8h7 f8f7 h7h8';
  S.variation.positions[1].best.lines[0].pv = `${checks} ${checks}`;
  assert.equal(a.call('selectedMoveExplanation'), 'Leads to a draw.');
  S.variation.positions[1].best.lines = [{multipv: 1, pv: 'f7f8'}, {multipv: 2, pv: `${checks} ${checks}`}];
  assert.equal(a.call('selectedMoveExplanation'), 'I have no idea why.');
});

test('mate takes priority over unrelated Concepts text in both views', t => {
  const a = app(t), S = loadGame(a, '1. e4 e5 2. Nf3 h6 3. Nxe5 f6');
  S.idx = 6; S.evals[6] = {mate: 6}; S.settings.conceptsEnabled = true;
  assert.equal(a.call('selectedMoveExplanation'), 'White can now force mate in 6.');
  branch(a, 0, 6);
  assert.equal(a.call('selectedMoveExplanation'), 'White can now force mate in 6.');
});

test('certified capture and recapture comments stay short', t => {
  const a = app(t), S = loadGame(a, '1. e4 d5 2. exd5 Qxd5');
  S.idx = 3; S.settings.conceptsEnabled = true;
  S.settings.conceptGroups = ['features', 'pawns', 'history', 'immediate'];
  const input = a.call('selectedConceptInput'), entries = new Map();
  a.context.__session = {entries}; a.run('_conceptSession = __session');
  entries.set(conceptKey(input), {findings: [{event: 'immediate-capture-gain', study: 'P006', text: 'Certified capture.', scopes: [],
    context: {evidence: {consequence: {inputFen: input.fen, playedMove: input.move, afterFen: S.positions[3].fen,
      captured: 'p', minimumGain: 1}}}}]});
  assert.equal(a.call('selectedMoveExplanation'), 'Free pawn.');
  S.idx = 4;
  assert.equal(a.call('selectedMoveExplanation'), 'Recaptures.');
  branch(a, 0, 4);
  assert.equal(a.call('selectedMoveExplanation'), 'Recaptures.');
});

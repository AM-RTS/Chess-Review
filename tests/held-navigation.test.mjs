import test from 'node:test';
import assert from 'node:assert/strict';
import {app, loadGame, branch} from './helpers/app.mjs';

function fixture(t, variation = false) {
  const a = app(t), S = loadGame(a, '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5');
  a.call('computeDerived'); a.call('buildUI');
  if (variation) { S.standalone = true; branch(a, 0, 0); }
  a.call('renderAll');
  let now = 1000, id = 0, searches = 0;
  const frames = new Map(), transitions = [], paint = a.run('paintBoard');
  a.context.performance = {now: () => now};
  a.context.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  a.context.cancelAnimationFrame = key => frames.delete(key);
  a.replace('requestLiveEval', () => { searches++; });
  a.replace('paintBoard', transition => { if (transition) transitions.push(transition); paint(transition); });
  const key = (type, name, repeat = false, target = a.dom.window.document.body) => {
    const event = new a.dom.window.KeyboardEvent(type, {key: name, repeat, bubbles: true, cancelable: true});
    target.dispatchEvent(event); return event;
  };
  const tick = ms => { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); };
  return {...a, key, tick, frames, transitions, searches: () => searches};
}

for (const variation of [false, true]) test(`held ${variation ? 'analysis' : 'review'} navigation shows every step and ignores OS repeats`, t => {
  const a = fixture(t, variation), index = () => variation ? a.state.variation.idx : a.state.idx;
  assert.equal(a.key('keydown', 'ArrowRight').defaultPrevented, true);
  assert.equal(index(), 1);
  const cell = a.dom.window.document.querySelector('.ml-move');
  for (let i = 0; i < 20; i++) a.key('keydown', 'ArrowRight', true);
  assert.equal(index(), 1);
  a.tick(249); assert.equal(index(), 1);
  a.tick(1); assert.equal(index(), 2);
  a.tick(100); assert.equal(index(), 3);
  assert.deepEqual(a.transitions.map(x => x.move.san), ['e4', 'e5', 'Nf3']);
  assert.deepEqual(a.transitions.map(x => x.duration), [180, 100, 100]);
  assert.equal(a.dom.window.document.querySelector('.ml-move'), cell);
  if (variation) assert.equal(a.searches(), 1);
  a.key('keyup', 'ArrowRight'); assert.equal(a.frames.size, 0);
  if (variation) assert.equal(a.searches(), 2);
  a.tick(1000); assert.equal(index(), 3);
  a.key('keydown', 'ArrowLeft'); a.tick(250); a.tick(100);
  assert.equal(index(), 0);
  a.tick(100); assert.equal(a.frames.size, 0);
});

test('a delayed frame advances once rather than skipping moves to catch up', t => {
  const a = fixture(t); a.key('keydown', 'ArrowRight');
  a.tick(1500); assert.equal(a.state.idx, 2);
  a.tick(100); assert.equal(a.state.idx, 3);
  a.key('keyup', 'ArrowRight');
});

test('player strips stay mounted during playback and synchronize on release', t => {
  const a = fixture(t); a.key('keydown', 'ArrowRight');
  const strip = a.dom.window.document.querySelector('.player-strip');
  a.tick(250); assert.equal(a.dom.window.document.querySelector('.player-strip'), strip);
  a.key('keyup', 'ArrowRight');
  assert.notEqual(a.dom.window.document.querySelector('.player-strip'), strip);
  assert.equal(a.dom.window.document.querySelector('.player-strip.active .name').textContent, 'White');
});

test('release, blur and editable fields cannot leave navigation running', t => {
  const a = fixture(t); a.key('keydown', 'ArrowRight'); a.tick(250);
  a.dom.window.dispatchEvent(new a.dom.window.Event('blur'));
  assert.equal(a.frames.size, 0);
  const index = a.state.idx; a.tick(1000); assert.equal(a.state.idx, index);
  const input = a.dom.window.document.createElement('input'); a.dom.window.document.body.append(input);
  a.key('keydown', 'ArrowRight', false, input); assert.equal(a.state.idx, index);
  a.key('keydown', 'ArrowRight', true); assert.equal(a.frames.size, 0);
});

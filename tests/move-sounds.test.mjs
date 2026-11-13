import test from 'node:test';
import assert from 'node:assert/strict';
import { app, deferred, settle } from './helpers/app.mjs';

test('captures override check and mate sounds in review and practice moves', t => {
  const a = app(t), played = [];
  a.state.settings.sound = true;
  a.replace('playEvent', event => played.push(event));

  for (const san of ['Bxf7+', 'Qxh7#', 'exd6+', 'gxh8=Q+']) {
    a.state.positions = [{}, { san }];
    a.call('playMoveSound', 1);
    a.call('playSanSound', san);
  }

  assert.deepEqual(played, Array(8).fill('capture'));
});

test('quiet moves, captures, checks, mates and castling retain their sounds', t => {
  const a = app(t);
  for (const [san, expected] of [
    ['e4', 'move'], ['Bxf7', 'capture'], ['Qh5+', 'check'], ['Qh7#', 'check'],
    ['O-O', 'castle'], ['O-O-O', 'castle'], ['0-0', 'castle'], ['O-O+', 'check'],
    [undefined, 'move'],
  ]) {
    assert.equal(a.call('sanSound', san), expected, san);
  }
});

function audio(t) {
  const a = app(t), sources = []; let now = 1000;
  const ctx = {state: 'running', destination: {},
    createGain: () => ({gain: {value: 1}, connect() {}}),
    createBufferSource() {
      const source = {playbackRate: {value: 1}, connect: gain => gain,
        start() { this.started = true; }, stop() { this.stopped = true; }};
      sources.push(source); return source;
    }};
  a.replace('audioCtx', () => ctx);
  a.context.performance = {now: () => now};
  a.state.settings.sound = true;
  const fx = {buffer: {duration: .25}, rate: 1};
  a.replace('processedFx', async () => fx);
  return {...a, sources, fx, advance: ms => { now += ms; }};
}

test('held-navigation sounds fit the slide interval and replace the previous cue', async t => {
  const a = audio(t); a.run('heldNavigation = {repeating:true, stepMs:100}');
  a.call('playEvent', 'move'); await settle();
  assert.equal(a.sources[0].playbackRate.value, 2.5);
  assert.equal(a.sources[0].started, true);
  a.advance(100); a.call('playEvent', 'capture'); await settle();
  assert.equal(a.sources[0].stopped, true);
  assert.equal(a.sources[1].playbackRate.value, 2.5);
});

test('late, superseded and released cues cannot play out of sync', async t => {
  const a = audio(t), old = deferred();
  a.replace('processedFx', () => old.promise); a.call('playEvent', 'move');
  a.advance(100); a.replace('processedFx', async () => a.fx);
  a.call('playEvent', 'capture'); await settle();
  old.resolve(a.fx); await settle(); assert.equal(a.sources.length, 1);
  a.run('heldNavigation = {repeating:true, stepMs:100}');
  const late = deferred(); a.replace('processedFx', () => late.promise);
  a.advance(100); a.call('playEvent', 'check'); a.advance(150);
  late.resolve(a.fx); await settle(); assert.equal(a.sources.length, 1);
  const released = deferred(); a.replace('processedFx', () => released.promise);
  a.call('playEvent', 'move'); a.run('++_navSoundToken; heldNavigation = null');
  released.resolve(a.fx); await settle(); assert.equal(a.sources.length, 1);
});

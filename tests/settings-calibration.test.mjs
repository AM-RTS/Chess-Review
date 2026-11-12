import test from 'node:test';
import assert from 'node:assert/strict';
import {app, loadGame, settle} from './helpers/app.mjs';

function settings(t) {
  const a = app(t); loadGame(a, '1. e4 e5');
  a.call('computeDerived'); a.call('buildUI'); a.call('renderAll');
  a.state.settings.engineDepth = 16;
  let searches = 0;
  for (const name of ['resetLiveEngine', 'invalidateVariationEvals', 'renderEngineCurrent']) a.replace(name, () => {});
  a.replace('scheduleReanalyze', () => { searches++; });
  return {...a, searches: () => searches};
}
function choice(a, text) {
  [...a.dom.window.document.querySelectorAll('.calibration-warning button')].find(button => (button.querySelector('.calibration-warning-choice-label')?.textContent || button.textContent) === text).click();
}

test('full SF19 is the default and Lite switches without the retired SF18 warning', async t => {
  const a = settings(t);
  assert.equal(a.state.settings.enginePath, 'sf19');
  await a.call('setEngineSetting', 'enginePath', 'sf19lite');
  assert.equal(a.store.settings.enginePath, 'sf19lite');
  assert.equal(a.searches(), 1);
  assert.equal(a.dom.window.document.querySelector('[role="alertdialog"]'), null);
  await a.call('setEngineSetting', 'enginePath', 'nnue');
  assert.equal(a.state.settings.enginePath, 'sf19lite');
});

test('depth dragging changes the live-panel setting on release', async t => {
  const a = settings(t), doc = a.dom.window.document;
  a.state.settingsTab = 'engine'; a.call('renderSettings');
  const slider = [...doc.querySelectorAll('.set-ctrl')].find(node => node.textContent.includes('Depth')).querySelector('input');
  slider.value = 18; slider.dispatchEvent(new a.dom.window.Event('input'));
  assert.equal(a.state.settings.engineDepth, 16);
  slider.dispatchEvent(new a.dom.window.Event('change')); await settle();
  assert.equal(a.state.settings.engineDepth, 18);
  assert.equal(doc.querySelector('.calibration-warning'), null);
});

test('engine settings omit classification controls and preserve existing classification preferences', t => {
  const a = settings(t); a.state.settingsTab = 'engine';
  Object.assign(a.state.settings, {clsClearAdv: 3, clsMistakeLoss: 1.5, clsMissTol: 0.7});
  const before = JSON.stringify({settings: a.state.settings, classif: a.state.classif, grades: a.state.moveGrades});
  a.call('renderSettings');
  assert.deepEqual([...a.dom.window.document.querySelectorAll('#settings .set-sect-head')].map(node => node.textContent), ['Search', 'Engine']);
  assert.equal(JSON.stringify({settings: a.state.settings, classif: a.state.classif, grades: a.state.moveGrades}), before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,settle} from './helpers/app.mjs';
function review(t,pgn='1. e4 e5'){const a=app(t);loadGame(a,pgn);a.call('computeDerived');a.call('buildUI');a.call('renderAll');a.replace('requestLiveEval',()=>{});return a;}
test('review controls support normal Tab traversal without a typed move field',async t=>{
  const a=review(t),doc=a.dom.window.document;
  assert.equal(doc.querySelector('.review-move-entry'),null);
  a.state.practice={spots:[1],i:0,solving:true};a.call('renderEngineCurrent');assert.equal(doc.querySelector('.review-move-entry'),null);a.state.practice=null;
  const event=()=>new a.dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});
  const mainTab=event();doc.body.dispatchEvent(mainTab);assert.equal(mainTab.defaultPrevented,false);
  await a.call('toggleSettings');const settingsTab=event();doc.querySelector('.set-tab').dispatchEvent(settingsTab);assert.equal(settingsTab.defaultPrevented,false);
  assert.ok([...doc.querySelectorAll('.lib-tab,.lc-open,.lc-fav,.engine-line.clickable')].every(n=>n.tabIndex===0));
});
test('promotion picker supports cancellation and explicit rook selection',t=>{
  const a=review(t,'[SetUp "1"]\n[FEN "8/k1P5/2K5/8/8/8/8/8 w - - 0 1"]\n\n1. Kb5'),doc=a.dom.window.document;
  a.call('applyUserMove','c7','c8',false);assert.ok(doc.querySelector('.promotion-picker'));assert.equal(doc.querySelector('.app').inert,true);
  doc.querySelector('.promotion-cancel').click();assert.equal(a.state.analysisMode,false);assert.equal(doc.querySelector('.promotion-picker'),null);
  a.call('applyUserMove','c7','c8',false);[...doc.querySelectorAll('.promotion-options button')].find(n=>n.textContent==='Rook').click();assert.equal(a.state.variation.positions[1].promotion,'r');assert.equal(doc.querySelector('.app').inert,false);
});
test('different promotion does not silently replay the recorded mainline',t=>{
  const a=review(t,'[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N');
  a.call('applyUserMove','a7','a8',false,'q');assert.equal(a.state.analysisMode,true);assert.equal(a.state.variation.positions[1].promotion,'q');
});
test('library toggle, game buttons, favorite focus and Escape form one keyboard workflow',async t=>{
  const a=review(t),doc=a.dom.window.document;const rec={id:'saved',pgn:'1. d4 d5',meta:{gameId:'saved'},myAcc:90,opName:'Opponent',fav:false};a.state.library=[rec];a.store.library=[structuredClone(rec)];a.call('renderLibrary');
  const toggle=doc.querySelector('.lib-tab'),panel=doc.querySelector('.lib-panel');assert.equal(toggle.tagName,'BUTTON');assert.equal(panel.inert,true);toggle.click();assert.equal(panel.inert,false);
  const open=doc.querySelector('.lc-open'),favorite=doc.querySelector('.lc-fav');assert.equal(open.tagName,'BUTTON');assert.equal(open.contains(favorite),false);favorite.focus();
  favorite.dispatchEvent(new a.dom.window.FocusEvent('focusout',{bubbles:true,relatedTarget:null}));
  favorite.click();await a.run('_libraryWriteQueue');
  assert.equal(a.store.library[0].fav,true);assert.equal(doc.activeElement.classList.contains('lc-fav'),true);assert.equal(a.state.pgn,'1. e4 e5');assert.equal(panel.inert,false);
  doc.activeElement.dispatchEvent(new a.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(panel.inert,true);assert.equal(doc.activeElement,toggle);
});
test('settings toggle updates retain control identity and Credits owns keyboard focus',async t=>{
  const a=review(t),doc=a.dom.window.document;await a.call('toggleSettings');[...doc.querySelectorAll('.set-sect-head')].find(n=>n.textContent==='Sound').click();
  const on=doc.querySelector('[data-setting="sound"][data-value="true"]');on.focus();on.click();await a.run('_settingsWriteQueue');await settle();assert.equal(doc.activeElement.dataset.setting,'sound');assert.equal(doc.activeElement.dataset.value,'true');
  const credits=doc.querySelector('[aria-label="Credits & attributions"]');credits.focus();a.call('openCredits');const card=doc.querySelector('.credits-card');assert.equal(card.getAttribute('aria-modal'),'true');assert.equal(card.contains(doc.activeElement),true);
  doc.activeElement.dispatchEvent(new a.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(a.state.idx,0);
  const last=[...card.querySelectorAll('button,a[href]')].at(-1);last.focus();last.dispatchEvent(new a.dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(doc.activeElement.getAttribute('aria-label'),'Close credits');
  doc.activeElement.click();assert.equal(doc.querySelector('.app').inert,false);assert.equal(doc.activeElement,credits);
});

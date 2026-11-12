import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame} from './helpers/app.mjs';

function review(t){
 const a=app(t);loadGame(a,'1. e4 e5');a.call('computeDerived');a.call('buildUI');a.call('renderAll');
 return {...a,bar:()=>a.dom.window.document.querySelector('.evalbar'),show(score){a.state.evals[0]=score;a.call('renderEvalBar');}};
}

test('evaluation bar defaults to solid colors and preserves its node across score changes',t=>{
 const a=review(t),bar=a.bar();assert.equal(a.state.settings.barStyle,'classic');
 a.show({cp:300});assert.equal(bar.style.getPropertyValue('--white-share'),'73%');assert.equal(bar.querySelector('.score.bot').textContent,'3.0');
 assert.equal(bar.getAttribute('role'),'meter');assert.equal(bar.getAttribute('aria-valuenow'),'300');
 a.show({cp:-300});assert.equal(a.bar(),bar);assert.equal(bar.style.getPropertyValue('--white-share'),'27%');assert.equal(bar.querySelector('.score.top').textContent,'3.0');
 assert.equal(bar.querySelector('.score.bot').textContent,'');
});

test('mate fills the bar fully and orientation does not change the underlying evaluation',t=>{
 const a=review(t);a.show({mate:3});assert.equal(a.bar().style.getPropertyValue('--white-share'),'100%');
 a.state.flipped=true;a.call('renderEvalBar');assert.equal(a.bar().classList.contains('flipped'),true);assert.equal(a.bar().style.getPropertyValue('--white-share'),'100%');
 a.show({mate:-2});assert.equal(a.bar().style.getPropertyValue('--white-share'),'0%');assert.equal(a.bar().querySelector('.score.top').textContent,'#2');
});

test('pending evaluations retain the fill and expose the pending state',t=>{
 const a=review(t);a.show({cp:200});const share=a.bar().style.getPropertyValue('--white-share');
 a.show(null);assert.equal(a.bar().style.getPropertyValue('--white-share'),share);assert.equal(a.bar().getAttribute('aria-busy'),'true');
 a.show({cp:0});assert.equal(a.bar().style.getPropertyValue('--white-share'),'50%');assert.equal(a.bar().hasAttribute('aria-busy'),false);
 a.state.settings.barStyle='accent';a.call('renderEvalBar');assert.equal(a.bar().classList.contains('eb-accent'),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,branch} from './helpers/app.mjs';

function review(t,pgn){
 const a=app(t);loadGame(a,pgn);a.replace('renderEngineCurrent',()=>{});
 a.call('computeDerived');a.call('buildUI');a.call('renderAll');return a;
}
function check(a,result){
 a.call('renderEvalBar');a.call('renderReview');
 const bar=a.dom.window.document.querySelector('.evalbar');
 assert.equal([...bar.querySelectorAll('.score')].map(n=>n.textContent).join(''),result);
 assert.equal(bar.title,result);assert.equal(bar.getAttribute('aria-valuetext'),result);
 assert.equal(a.dom.window.document.querySelector('#reviewMount .ip-eval')?.textContent,result);
}

for(const [pgn,result]of [
 ['1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#','1-0'],
 ['1. f3 e5 2. g4 Qh4#','0-1'],
 ['[SetUp "1"]\n[FEN "7k/5K2/8/6Q1/8/8/8/8 w - - 0 1"]\n\n1. Qg6','Draw'],
 ['1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8','Draw'],
])test('terminal review and variation display '+result+' instead of a mate or numeric evaluation: '+pgn.split('\n').at(-1),t=>{
 const a=review(t,pgn);a.call('go',a.state.total);check(a,result);
 const v=branch(a);a.call('renderAll');check(a,result);
 a.state.standalone=true;a.call('renderReview');check(a,result);
 v.idx=Math.max(0,v.idx-1);a.call('renderEvalBar');
 assert.equal(a.call('activeResult'),null);assert.equal(a.dom.window.document.querySelector('.evalbar').classList.contains('is-result'),false);
});

test('mate ahead retains #N and moving back from a recorded result restores the evaluation',t=>{
 const a=review(t,'1. e4 e5');a.state.headers.Result='0-1';a.call('go',2);check(a,'0-1');
 a.state.evals[1]={mate:1};a.call('go',1);
 assert.equal(a.call('activeResult'),null);assert.equal(a.dom.window.document.querySelector('#reviewMount .ip-eval').textContent,'#1');
 a.call('go',2);branch(a);a.call('renderAll');assert.equal(a.call('activeResult'),null);
});

test('terminal setup positions show Draw even without engine evaluation or played moves',t=>{
 const a=review(t,'[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/K7 w - - 0 1"]\n\n*');
 a.state.evals[0]=null;check(a,'Draw');assert.equal(a.dom.window.document.querySelector('.white-fill').parentElement.style.getPropertyValue('--white-share'),'50%');
});

test('a recorded agreement at the final nonterminal position displays Draw',t=>{
 const a=review(t,'1. e4 e5');a.state.headers.Result='1/2-1/2';a.call('go',2);check(a,'Draw');
 a.call('go',1);assert.equal(a.call('activeResult'),null);
});

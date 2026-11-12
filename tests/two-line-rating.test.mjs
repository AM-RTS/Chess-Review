import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Chess} from '../lib/chess.js';
import {analyseCalibratedPosition} from '../lib/calibrated-search.js';
import {calibratedReview} from '../lib/calibrated-review.js';
import {app,loadGame} from './helpers/app.mjs';
const calibration=JSON.parse(await readFile(new URL('../data/calibration.json',import.meta.url)));
for(const build of ['sf19','sf19lite'])test(build+': review retains two lines and accuracy without rating work',async()=>{
 const calls=[],fen=new Chess().fen();
 const engine={buildKey:build,async setOptions(){},async analyse(f,d,lines,h,p,options){calls.push({lines,options});return {bestmove:options.searchMove||'e2e4',score:{cp:20}};}};
 const root=await analyseCalibratedPosition(engine,{fen,played:'d2d4',settings:{enginePath:build,engineDepth:16,engineHash:16,engineSkill:20,classifyLines:2},calibration,needMovesOnly:true});
 assert.deepEqual(calls.map(c=>c.lines),[2,1]);assert.equal(root.ratingEvidence,undefined);assert.equal(root.calibration.ratingVersion,undefined);
 const board=new Chess(),move=board.move('d4');
 const result=calibratedReview([{fen},{...move,fen:board.fen()}],[root],calibration,{w:{rating:1500}});
 assert.equal(result.w.accuracy,100);assert.equal(result.w.rating,undefined);assert.equal(result.w.ratingMoves,undefined);
});
test('review and engine settings omit estimated ratings but retain recorded ratings',t=>{
 const a=app(t);loadGame(a,'[WhiteElo "1500"]\n\n1. e4 e5');a.state.players.w.rating='1500';a.call('computeDerived');a.call('buildUI');a.call('renderAll');
 assert.equal(a.dom.window.document.querySelector('.est-rating'),null);
 a.state.settingsTab='engine';a.call('renderSettings');
 assert.doesNotMatch(a.run('UI.settings').textContent,/Estimated rating|Rating mode|Moves only/);
 assert.equal(a.state.settings.ratingMode,undefined);assert.equal(a.state.players.w.rating,'1500');
});
test('completed reviews visibly disclose reduced-depth move evaluations',t=>{
 const a=app(t);a.call('buildUI');a.state.analyzing=false;a.call('renderStats');
 assert.doesNotMatch(a.run('UI.stats').textContent,/Time-limited analysis/);
 a.state.bests=[{playedSearchLimited:{depth:12}}];a.call('renderStats');
 assert.match(a.run('UI.stats').querySelector('[role="status"]').textContent,/Accuracy and move badges may change/);
 a.state.bests=[{stoppedEarly:true}];a.call('renderStats');
 assert.match(a.run('UI.stats').querySelector('[role="status"]').textContent,/Time-limited analysis/);
});

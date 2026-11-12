import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {openResearchData,sha256} from '../../../data-policy.mjs';
import {fitEvidence} from './fit.mjs';
import {Chess} from '../../../../lib/chess.js';
import {calibratedReview} from '../../../../lib/calibrated-review.js';
import {movesOnlyRating,contextualRating,ratingGameQuality} from '../../../../lib/public-scoring.js';
const build=process.argv[2],suffix=process.argv[3]==='adjacent'?'-adjacent':'';if(!['sf19','sf19lite'].includes(build))throw Error('Expected build');
const data=await openResearchData(['D001','D002'],{purpose:'validate'}),base='research/experiments/E281-two-line-rating/evidence/';
const inputs=await data.readJson(base+build+suffix+'-observations.json.gz'),model=await data.readJson(base+build+suffix+'-model.json');
const calibration=JSON.parse(await readFile('data/calibration.json','utf8')),old=calibration.movesOnly.sf19.model;
const replay=fitEvidence(inputs,old);assert.deepEqual(replay,model);
let runtimeSides=0;
if(model.schema==='two-line-rating-v2'){
 const runtime={...calibration,twoLineRatings:{[build]:model}};
 for(const game of inputs.results){
  const board=new Chess(),positions=[{fen:board.fen()}];
  for(const move of game.moves){const p=board.move({from:move.slice(0,2),to:move.slice(2,4),promotion:move[4]});positions.push({...p,fen:board.fen()});}
  const bests=game.roots.map(root=>({...root,calibration:{version:runtime.version,build,nodes:build==='sf19lite'?20000:null,ratingVersion:model.candidateVersion,contextVersion:model.candidateVersion,ratingSettingsMatch:true}}));
  const players=Object.fromEntries(game.rows.map(r=>[r.color,{rating:r.ratingTarget}]));
  const moves=calibratedReview(positions,bests,runtime,players,'moves'),context=calibratedReview(positions,bests,runtime,players,'context');
  for(const row of game.rows){
   assert.ok(Math.abs(moves[row.color].rating-movesOnlyRating(row.contextMoves,model.model))<1e-9);
   const expected=contextualRating(row.ratingTarget,ratingGameQuality(row.contextMoves),row.contextMoves.filter(m=>m.eligible).length,model.context);
   assert.ok(Math.abs(context[row.color].rating-expected.rating)<1e-9);runtimeSides++;
  }
 }
}
const report={passed:true,build,observationsHash:data.receipt.inputHashes[base+build+suffix+'-observations.json.gz'],modelHash:sha256(JSON.stringify(model)),candidateVersion:model.candidateVersion,runtimeSides,runtimeModes:runtimeSides?2:0,meaning:'Separate-process exact refit, validation and production-rating replay; not new scientific confirmation.'};
await writeFile(base+build+suffix+'-replay.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

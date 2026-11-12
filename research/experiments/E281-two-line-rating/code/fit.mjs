import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {openResearchData,sha256} from '../../../data-policy.mjs';
import {ratingFeatures,movesOnlyRating,ratingGameQuality} from '../../../../lib/public-scoring.js';
import {fitHuber} from '../../../../tools/calibration/fit-huber.mjs';
import {metrics} from '../../../../tools/calibration/fit-rating.mjs';
import {fitFullgameContext,fullgameContextMetrics} from '../../../../tools/calibration/fullgame-context.mjs';

export const names=['logRmsLoss','topRate','earlyRmsLoss','contestedRmsLoss','contestedFraction','earlyTopRate','middleTopRate','decisionsLog','legalChoicesLog'];
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
export function bootstrapDifference(rows,a,b){
 const ids=[...new Set(rows.map(r=>r.gameId))],groups=ids.map(id=>rows.map((r,i)=>r.gameId===id?i:-1).filter(i=>i>=0));
 let seed=281;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},d=[];
 for(let k=0;k<2000;k++){let sum=0,n=0;for(let j=0;j<ids.length;j++)for(const i of groups[Math.floor(random()*ids.length)]){sum+=Math.abs(a[i]-rows[i].ratingTarget)-Math.abs(b[i]-rows[i].ratingTarget);n++;}d.push(sum/n);}
 d.sort((a,b)=>a-b);return [d[49],d[1949]];
}
export function fitEvidence(evidence,oldModel){
 if(!evidence.complete||evidence.config.lines!==2||evidence.games!==170)throw Error('Incomplete/wrong observation protocol');
 const all=evidence.results.flatMap(g=>g.rows),rows=all.filter(r=>r.contextMoves.filter(m=>m.eligible).length>=10);
 const train=rows.filter(r=>r.split==='train'),validation=rows.filter(r=>r.split==='validation');
 if(train.some(r=>validation.some(v=>v.gameId===r.gameId)))throw Error('Game leaks across fitting roles');
 if(train.length<150||validation.length<60||all.some(r=>!['train','validation'].includes(r.split)))throw Error('Insufficient/wrong fitting roles');
 const model=fitHuber(train.map(r=>({...r,...ratingFeatures(r.contextMoves)})),10,names,250);
 const targets=train.map(r=>r.ratingTarget).sort((a,b)=>a-b),mid=targets.length>>1,constant=(targets[(targets.length-1)>>1]+targets[mid])/2;
 const predictions=validation.map(r=>movesOnlyRating(r.contextMoves,model)),baseline=validation.map(()=>constant),old=validation.map(r=>movesOnlyRating(r.contextMoves,oldModel));
 if(predictions.some(x=>!Number.isFinite(x)))throw Error('Nonfinite validation rating');
 const candidate=metrics(validation,predictions),constantMetrics=metrics(validation,baseline),oldMetrics=metrics(validation,old),interval=bootstrapDifference(validation,predictions,baseline);
 const bands=[[0,1200],[1200,1800],[1800,Infinity]].map(([lo,hi])=>{
   const indices=validation.map((r,i)=>r.ratingTarget>=lo&&r.ratingTarget<hi?i:-1).filter(i=>i>=0),sub=indices.map(i=>validation[i]);
   return {range:[lo,Number.isFinite(hi)?hi:null],candidate:metrics(sub,indices.map(i=>predictions[i])),constant:metrics(sub,indices.map(i=>baseline[i]))};
 });
 const contextRows=all.map(r=>({gameId:r.gameId,color:r.color,split:r.split,rating:r.ratingTarget,decisions:r.contextMoves.filter(m=>m.eligible).length,quality:ratingGameQuality(r.contextMoves)??100}));
 const context=fitFullgameContext(contextRows.filter(r=>r.split==='train'));
 const contextValidation=fullgameContextMetrics(contextRows.filter(r=>r.split==='validation'),context);
 const passed=candidate.mae<=.95*constantMetrics.mae&&interval[1]<0&&bands.every(b=>!b.candidate||b.candidate.n<10||b.candidate.mae<=b.constant.mae+100);
 const validationReport={candidate,constant:constantMetrics,oldLiteAppliedToNewInputs:oldMetrics,maeDifference95:interval,bands,passed,coverage:{training:train.length,validation:validation.length,totalTraining:all.filter(r=>r.split==='train').length,totalValidation:all.filter(r=>r.split==='validation').length},context:contextValidation};
 const candidateVersion=sha256(JSON.stringify({config:evidence.config,hashes:evidence.hashes,model,context}));
 return {schema:'two-line-rating-v1',candidateVersion,engineConfig:evidence.config,engineHashes:evidence.hashes,model,context,validation:validationReport,
  limitations:'Recorded Lichess blitz rating prediction, not established ability or Chess.com Elo. Player-disjoint fitting/development splits; validation previously exposed to other studies. No fresh confirmation.'};
}
async function main(){
 const build=process.argv[2];if(!['sf19','sf19lite'].includes(build))throw Error('Expected build');
 const data=await openResearchData(['D001','D002'],{purpose:'train'});
 const evidence=await data.readJson(`research/experiments/E281-two-line-rating/evidence/${build}-observations.json.gz`);
 const old=JSON.parse(await readFile('data/calibration.json','utf8')).movesOnly.sf19.model;
 const fitted=fitEvidence(evidence,old),out=`research/experiments/E281-two-line-rating/evidence/${build}-model.json`;
 await writeFile(out,JSON.stringify(fitted,null,2)+'\n');console.log(JSON.stringify({build,...fitted.validation}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();

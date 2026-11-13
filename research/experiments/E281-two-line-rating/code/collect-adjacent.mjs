import {readFile,writeFile,appendFile,mkdir,access} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {openResearchData,sha256} from '../../../data-policy.mjs';
import {Chess} from '../../../../lib/chess.js';
import {adjacentRatingMove} from '../../../../tools/calibration/rating-scoring.mjs';
import {connect} from './node-engine.mjs';

const build=process.argv[2];if(!['sf19','sf19lite'].includes(build))throw Error('Expected engine build');
const prefix='research/experiments/E281-two-line-rating/evidence',out=`research/runs/E281/${build}-adjacent`,target=`${prefix}/${build}-adjacent-observations.json.gz`;
try{await access(target);throw Error('Completed evidence already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(out,{recursive:true});
const data=await openResearchData(['D001','D002'],{purpose:'collect'}),source=await data.readJson('research/datasets/D002-fresh-prefix/games.json.gz');
const games=['train','validation'].flatMap(role=>source.filter(g=>g.split===role).sort((a,b)=>sha256('E281:'+a.id).localeCompare(sha256('E281:'+b.id))).slice(0,role==='train'?120:50));
const budget=build==='sf19'?{kind:'depth',value:16}:{kind:'nodes',value:20000},initialFen=new Chess().fen();
const config={build,budget,lines:2,Hash:build==='sf19'?16:32,skill:20,cold:true,exact:true,history:'startpos + complete played moves',ratingFeatureProtocol:'adjacent-v1'};
const cache=new Map(),pending=new Map(),parents=[];
function retain(evidence){
 for(const key of ['build','Hash','lines','skill'])if(evidence.config[key]!==config[key])throw Error('Reuse configuration differs');
 if(JSON.stringify(evidence.config.budget)!==JSON.stringify(budget))throw Error('Reuse budget differs');
 for(const result of evidence.results){
  const game=games.find(g=>g.id===result.gameId);if(!game||result.split!==game.split||JSON.stringify(result.observations.map(p=>p.played))!==JSON.stringify(game.moves))throw Error('Reuse history differs');
  result.observations.forEach((p,i)=>cache.set(game.moves.slice(0,i).join(' '),p.root));
 }
}
if(build==='sf19lite'){
 const file=`${prefix}/sf19lite-observations.json.gz`;retain(await data.readJson(file));parents.push(file);
}else{
 const file=`${prefix}/sf19-partial/resume.json`,partial=await data.readJson(file),results=[];parents.push(file);
 for(const name of partial.files)results.push(await data.readJson(name));retain({config:partial.header.config,results});
}
const files=['engine/uci.js','engine/progress.js','lib/public-scoring.js','tools/calibration/rating-scoring.mjs','research/experiments/E281-two-line-rating/code/collect-adjacent.mjs','research/experiments/E281-two-line-rating/code/node-engine.mjs',`engine/stockfish-19-${build==='sf19'?'':'lite-'}single.js`,`engine/stockfish-19-${build==='sf19'?'':'lite-'}single.wasm`];
const hashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha256(await readFile(f))])));
const started=performance.now(),engines=[],results=[],active=new Map();let cursor=0,searches=0,reused=0,completed=0,failure=null;
const header={schema:'E281-adjacent-observations-v1',config,hashes,games:170,selectionHash:sha256(JSON.stringify(games.map(g=>g.id))),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dataEligibility:data.receipt,reuseParents:parents,reusedRoots:cache.size};
await writeFile(`${out}/header.json`,JSON.stringify(header,null,2));
const progress=async state=>writeFile(`${out}/progress.json`,JSON.stringify({state,build,completed,total:170,searches,reused,seconds:(performance.now()-started)/1000,active:[...active.values()],error:failure?.message},null,2));
const timer=setInterval(()=>{void progress('running').catch(()=>{});},15000);
async function worker(){
 const engine=await connect(build);engines.push(engine);
 async function root(board,moves,index,ply){
  if(board.isCheckmate())return {bestmove:null,score:{mate:-1}};
  if(board.isDraw())return {bestmove:null,score:{cp:0}};
  const key=moves.join(' ');if(cache.has(key)){reused++;return cache.get(key);}if(pending.has(key)){reused++;return pending.get(key);}
  const work=(async()=>{
   searches++;active.set(engine,{index,ply,searches});
   const options={budget,cold:true,requireExact:true},history={initialFen,moves};let result;
   try{result=await engine.analyse(board.fen(),16,2,history,null,options);}
   catch(error){
    if(error.scoringMove){searches++;result=await engine.analyse(board.fen(),16,1,history,null,{...options,searchMove:error.scoringMove});result.exactRecovery=true;}
    else {await writeFile(`${out}/failed-${index}-${ply}.json`,JSON.stringify({index,ply,history,error:error.message,recent:engine.worker.recent},null,2));throw error;}
   }
   await appendFile(`${out}/roots-${engine.worker.child.pid}.jsonl`,JSON.stringify({moves,result})+'\n');cache.set(key,result);return result;
  })();pending.set(key,work);
  try{return await work;}finally{pending.delete(key);active.delete(engine);}
 }
 for(;;){
  if(failure)return;const j=cursor++;if(j>=games.length)return;
  if(performance.now()-started>(build==='sf19'?90*60*1000-1313231:15*60*1000))throw Error('Collection budget exceeded');
  const game=games[j],board=new Chess(),roots=[],choices=[];
  for(let i=0;i<=game.moves.length;i++){
   roots.push(await root(board,game.moves.slice(0,i),j,i));
   if(i<game.moves.length){choices.push(board.moves().length);const u=game.moves[i];board.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});}
  }
  const rows=['w','b'].map((color,k)=>({gameId:game.id,color,split:game.split,ratingTarget:game.players[k].rating,contextMoves:[]}));
  game.moves.forEach((played,i)=>rows[i%2].contextMoves.push({...adjacentRatingMove(roots[i],roots[i+1],{played,ply:i+1,legalChoices:choices[i]}),engine:build}));
  results[j]={gameId:game.id,split:game.split,moves:game.moves,roots,rows};completed++;
  await writeFile(`${out}/game-${j}.json.gz`,gzipSync(JSON.stringify(results[j])));await progress('running');
  if(completed%5===0||completed===170)console.log(JSON.stringify({build,completed,total:170,searches,reused,seconds:Math.round((performance.now()-started)/1000)}));
 }
}
try{
 const settled=await Promise.allSettled(Array.from({length:build==='sf19'?6:2},async()=>{try{await worker();}catch(e){failure ||= e;throw e;}}));
 if(failure)throw failure;if(settled.some(r=>r.status==='rejected'))throw Error('Worker failed');
 const result={...header,complete:true,searches,reused,elapsedMs:performance.now()-started,results};
 await writeFile(target,gzipSync(JSON.stringify(result)));await progress('complete');console.log(JSON.stringify({complete:true,build,searches,reused,seconds:result.elapsedMs/1000}));
}catch(error){failure=error;await progress('failed');throw error;}finally{clearInterval(timer);engines.forEach(e=>e.terminate());}

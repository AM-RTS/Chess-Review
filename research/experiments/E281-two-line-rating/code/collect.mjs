import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {openResearchData,sha256} from '../../../data-policy.mjs';
import {Chess} from '../../../../lib/chess.js';
import {engineExpectedPoints} from '../../../../lib/public-scoring.js';
import {connect} from './node-engine.mjs';

const [build='sf19lite',mode='pilot']=process.argv.slice(2);
if(!['sf19','sf19lite'].includes(build)||!['pilot','full'].includes(mode))throw Error('Usage: collect.mjs sf19|sf19lite pilot|full');
const prefix='research/experiments/E281-two-line-rating/evidence',out=`research/runs/E281/${build}-${mode}`;
await mkdir(out,{recursive:true});await mkdir(prefix,{recursive:true});
const target=`${prefix}/${build}-observations.json.gz`;
if(mode==='full'){try{await access(target);throw Error('Refusing to overwrite completed evidence');}catch(e){if(e.code!=='ENOENT')throw e;}}
const data=await openResearchData(['D001','D002'],{purpose:'collect'});
const source=await data.readJson('research/datasets/D002-fresh-prefix/games.json.gz');
const selected=['train','validation'].flatMap(role=>source.filter(g=>g.split===role)
  .sort((a,b)=>sha256('E281:'+a.id).localeCompare(sha256('E281:'+b.id))).slice(0,role==='train'?120:50));
const games=mode==='pilot'?['train','validation'].map(role=>selected.find(g=>g.split===role)):selected;
const initialFen=new Chess().fen(),budget=build==='sf19'?{kind:'depth',value:16}:{kind:'nodes',value:20000};
const config={build,budget,lines:2,Hash:build==='sf19'?16:32,skill:20,cold:true,exact:true,history:'startpos + complete played moves'};
const files=['research/experiments/E281-two-line-rating/code/collect.mjs','research/experiments/E281-two-line-rating/code/node-engine.mjs','engine/uci.js','engine/progress.js','lib/chess.js',`engine/stockfish-19-${build==='sf19'?'':'lite-'}single.js`,`engine/stockfish-19-${build==='sf19'?'':'lite-'}single.wasm`];
const hashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha256(await readFile(f))])));
const started=performance.now(),engines=[],results=[];let cursor=0,searches=0,completed=0;
const header={schema:'E281-observations-v1',sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),config,hashes,dataEligibility:data.receipt,selectionHash:sha256(JSON.stringify(games.map(g=>g.id))),games:games.length};
await writeFile(`${out}/header.json`,JSON.stringify(header,null,2));
async function progress(state,error){await writeFile(`${out}/progress.json`,JSON.stringify({state,build,completed,total:games.length,searches,elapsedSeconds:(performance.now()-started)/1000,...(error?{error}: {})},null,2));}
async function worker(){
 const e=await connect(build);engines.push(e);
 async function search(fen,history,lines,searchMove){
   searches++;try{return await e.analyse(fen,16,lines,history,null,{budget,cold:true,requireExact:true,...(searchMove?{searchMove}: {})});}
   catch(error){if(searchMove||!error.scoringMove)throw error;return search(fen,history,1,error.scoringMove);}
 }
 for(;;){
   const j=cursor++;if(j>=games.length)return;
   if(performance.now()-started>90*60*1000)throw Error('Collection time budget exceeded');
   const g=games[j],board=new Chess(),observations=[],sides={w:[],b:[]};
   for(let i=0;i<g.moves.length;i++){
     const fen=board.fen(),color=board.turn(),legal=board.moves().length,history={initialFen,moves:g.moves.slice(0,i)},played=g.moves[i];
     const root=await search(fen,history,2),actual=root.bestmove===played?root:await search(fen,history,1,played);
     if(!root.score||!actual.score)throw Error('Incomplete scoring evidence');
     const bestExpected=engineExpectedPoints(root.score),playedExpected=engineExpectedPoints(actual.score),top=root.bestmove===played;
     sides[color].push({ply:i+1,legalChoices:legal,top,eligible:legal!==1,bestExpected,loss:legal===1||top?0:Math.max(0,bestExpected-playedExpected),engine:build});
     observations.push({played,root,playedScore:actual.score});
     if(!board.move({from:played.slice(0,2),to:played.slice(2,4),promotion:played[4]}))throw Error('Illegal normalized history');
   }
   results[j]={gameId:g.id,split:g.split,rows:['w','b'].map((color,k)=>({gameId:g.id,color,split:g.split,ratingTarget:Number(g.players[k].rating),contextMoves:sides[color]})),observations};
   await writeFile(`${out}/game-${j}.json.gz`,gzipSync(JSON.stringify(results[j])));completed++;await progress('running');
   console.log(JSON.stringify({build,completed,total:games.length,searches,seconds:Math.round((performance.now()-started)/1000)}));
 }
}
try{
 await Promise.all(Array.from({length:mode==='pilot'?2:8},worker));
 const result={...header,complete:true,elapsedMs:performance.now()-started,searches,results};
 await writeFile(mode==='full'?target:`${out}/observations.json.gz`,gzipSync(JSON.stringify(result)));
 await progress('complete');console.log(JSON.stringify({complete:true,build,mode,seconds:result.elapsedMs/1000,plies:results.reduce((s,g)=>s+g.observations.length,0)}));
}catch(error){await progress('failed',error.message);throw error;}finally{engines.forEach(e=>e.terminate());}

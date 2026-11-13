import assert from 'node:assert/strict';
import {expectedPoints, SF19_OUTCOME} from '../../../../lib/public-scoring.js';
import {engineExpectedPoints} from '../../../../tools/calibration/rating-scoring.mjs';
import {SPEC,PARENTS,validateObservation,smokeDecision} from './protocol.mjs';
const sum=xs=>xs.reduce((a,b)=>a+b,0);
export function distribution(values){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return {n:s.length,mean:sum(s)/s.length,median:s[Math.floor((s.length-1)*.5)],p95:s[Math.floor((s.length-1)*.95)],min:s[0],max:s.at(-1)};}
const units=s=>s.mate!=null?(s.mate>0?2000:0):2*s.wdl[0]+s.wdl[1];
export function assess(selection,raw,cached,historical){
  assert.equal(raw.schema,'E274-collection-v1');assert.equal(raw.configHash,selection.configHash);
  const available=new Map(),fresh=new Map();
  for(const q of selection.queries.filter(q=>q.cached)){const r=cached.get(q.key);assert.ok(r);validateObservation(r,selection);available.set(q.key,r);}
  for(const r of raw.newSearches){assert.ok(!available.has(r.key)&&!fresh.has(r.key));assert.ok(!selection.queries.find(q=>q.key===r.key)?.cached);
    validateObservation(r,selection);fresh.set(r.key,r);available.set(r.key,r);}
  assert.equal(raw.newUniqueQueries,fresh.size);assert.equal(raw.requests,sum(raw.newSearches.map(r=>r.requestCount))+(raw.failedObservation?.requestCount||0));
  if(raw.smoke){const want=smokeDecision(raw.newSearches.slice(0,SPEC.smokeNewQueries).map(r=>r.callerWallMs),selection.newQueries);assert.deepEqual(raw.smoke,want);}
  const vectors=selection.positions.map(p=>{
    const root=available.get(p.rootKey),alts=p.alternatives.map(a=>available.get(a.key));
    if(!root||alts.some(r=>!r))return {gameId:p.gameId,color:p.color,ply:p.ply,complete:false,legalChoices:p.legalMoves.length};
    const wdls=alts.map(r=>units(r.score)),cps=alts.map(r=>expectedPoints(r.score,SF19_OUTCOME)),sorted=[...wdls].sort((a,b)=>b-a);
    const played=alts[p.legalMoves.indexOf(p.played)],rangeWdl=(Math.max(...wdls)-Math.min(...wdls))/2000;
    return {gameId:p.gameId,color:p.color,ply:p.ply,complete:true,legalChoices:p.legalMoves.length,rangeWdl,
      rangeCp:Math.max(...cps)-Math.min(...cps),topGapWdl:(sorted[0]-sorted[1])/2000,nearBestFraction:wdls.filter(w=>sorted[0]-w<=40).length/wdls.length,
      playedRegretWdl:(sorted[0]-units(played.score))/2000,
      negativeRootResidual:engineExpectedPoints(root.score)<engineExpectedPoints(played.score),varied:rangeWdl>=SPEC.variationRange};
  });
  const complete=vectors.filter(v=>v.complete),sides=selection.sides.map(s=>{const rows=vectors.filter(v=>v.gameId===s.gameId&&v.color===s.color);
    return {gameId:s.gameId,color:s.color,selected:rows.length,complete:rows.filter(r=>r.complete).length,varied:rows.filter(r=>r.complete&&r.varied).length};});
  const walls=raw.newSearches.map(r=>r.callerWallMs),engine=raw.newSearches.map(r=>r.elapsedMs),meanWall=walls.length?sum(walls)/walls.length:null;
  const extraReuse=selection.queries.filter(q=>q.cached&&cached.get(q.key)?.reuseSource===PARENTS[3]).length;
  const feasibility={allVectors:complete.length===40&&sides.every(s=>s.complete===10),smoke:raw.smoke?.passed===true,
    time:raw.collectorWallMs<=SPEC.maxCollectorMs,queryLimit:fresh.size<=SPEC.maxNewQueries,requestLimit:raw.requests<=SPEC.maxRequests,
    noFailures:raw.error===null&&raw.stopReason==='complete'&&raw.complete===true};
  const variation={fraction:complete.filter(v=>v.varied).length/selection.positions.length>=SPEC.variationFraction,sides:sides.every(s=>s.varied>=SPEC.variationPerSide)};
  return {schema:'E274-pilot-result-v1',role:'two-game exposed development collection feasibility; no fitted rating or human-validity claim',
    games:selection.games.length,plannedVectors:selection.positions.length,completeVectors:complete.length,sides,
    queryCounts:{planned:selection.queries.length,reused:selection.reusedQueries,plannedNew:selection.newQueries,observedNew:fresh.size,requests:raw.requests,
      failedReturnedObservation:!!raw.failedObservation,inFlightRequestCountUnknown:!!raw.pendingQuery&&!raw.failedObservation},
    timing:{collectorWallMs:raw.collectorWallMs,startupWallMs:raw.startupWallMs,engineReturn:distribution(engine),callerWall:distribution(walls),
      callerSumMs:sum(walls),engineReturnSumMs:sum(engine),overheadOutsideCallerMs:raw.collectorWallMs-sum(walls),
      recoveries:raw.newSearches.filter(r=>r.exactRecovery).length,smoke:raw.smoke},
    variation:{completeDenominator:complete.length,plannedDenominator:selection.positions.length,variedVectors:complete.filter(v=>v.varied).length,
      wdlRanges:distribution(complete.map(v=>v.rangeWdl)),cpRanges:distribution(complete.map(v=>v.rangeCp)),topGapsWdl:distribution(complete.map(v=>v.topGapWdl)),
      negativeRootResiduals:complete.filter(v=>v.negativeRootResidual).length,gates:variation,passed:Object.values(variation).every(Boolean)},
    extrapolation:{historicalMissingQueries:historical.queries.missingUnique,additionalE011ReuseWithinPilot:extraReuse,remainingAfterPilot:historical.queries.missingUnique-fresh.size-extraReuse,
      historicalSerialHours:historical.cost.missingSerialHoursMean,currentCallerHoursForOriginalMissing:meanWall===null?null:historical.queries.missingUnique*meanWall/3600000,
      currentCallerHoursRemaining:meanWall===null?null:(historical.queries.missingUnique-fresh.size-extraReuse)*meanWall/3600000,
      interpretation:'Convenience two-game histories and correlated alternatives; different input mix confounds hardware comparisons. E271 reference omitted E011 roots; further matches outside this pilot are unknown. No guaranteed bulk runtime or speedup claim.'},
    feasibilityGates:feasibility,passed:Object.values(feasibility).every(Boolean),vectors,stopReason:raw.stopReason,error:raw.error,
    engineSearches:raw.requests,modelFits:0,humanLabels:0,confirmation:false,promoted:false};
}

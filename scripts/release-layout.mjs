import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

// Audit a disposable copy of the latest Chrome package. Test exports, profiles,
// screenshots and fixture games never enter either store ZIP or the user's profile.
const root=process.cwd(), artifacts=path.join(root,'web-ext-artifacts');
const {recordPath}=JSON.parse(await fs.readFile(path.join(artifacts,'latest-release.json')));
const record=JSON.parse(await fs.readFile(recordPath));
const out=await fs.mkdtemp(path.join(path.dirname(recordPath),'layout-'));
const source=await fs.mkdtemp(path.join(artifacts,'layout-chrome-'));
await fs.cp(record.packages.find(p=>p.browser==='chrome').sourceDir,source,{recursive:true});
await fs.appendFile(path.join(source,'analysis.js'),'\nexport {S, resetLayout, toggleReorganize, updateLibrary, go, applyGame, _conceptSession, selectedConceptInput, renderEngine, renderEngineCurrent, renderStats};\n');
await fs.writeFile(path.join(source,'audit.html'),'<!doctype html><script type="module" src="audit.js"></script>');
await fs.writeFile(path.join(source,'audit.js'),"import {browserAPI} from './browser-compat.js'; window.api=browserAPI;");
const profile=await fs.mkdtemp(path.join(artifacts,'layout-profile-'));
const chrome=spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  '--enable-unsafe-extension-debugging',`--user-data-dir=${profile}`,'about:blank',
],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const keepAlive=setInterval(()=>{},1000);
let ws;
try {
  let portInfo;
  for(let i=0;i<100;i++){try{portInfo=await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8');break;}catch{await sleep(100);}}
  if(!portInfo)throw Error('Chrome did not expose its debugging port');
  const [port,route]=portInfo.trim().split(/\r?\n/);
  ws=new WebSocket(`ws://127.0.0.1:${port}${route}`);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP connection timed out')),10000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(Error('CDP connection failed'));};});
  let seq=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const {resolve,reject,timer}=pending.get(m.id);pending.delete(m.id);clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);}};
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,sessionId}));});
  const loaded=await call('Extensions.loadUnpacked',{path:source});
  const create=async(url)=>{const {targetId}=await call('Target.createTarget',{url});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});return {targetId,sessionId};};
  const evaluate=async(t,expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},t.sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  // Pass fixture data as CDP values, never interpolate it into executable code.
  const setStorage=async(tab,items,clear=false)=>{
    const {result,exceptionDetails}=await call('Runtime.evaluate',{expression:'globalThis'},tab.sessionId);
    if(exceptionDetails)throw Error(JSON.stringify(exceptionDetails));
    try {
      const r=await call('Runtime.callFunctionOn',{
        objectId:result.objectId,
        functionDeclaration:'async function(items, clear) { if(clear) await this.api.storage.local.clear(); await this.api.storage.local.set(items); }',
        arguments:[{value:items},{value:clear}],awaitPromise:true,returnByValue:true,
      },tab.sessionId);
      if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
    } finally {await call('Runtime.releaseObject',{objectId:result.objectId},tab.sessionId);}
  };
  const waitFor=async(tab,expression,label,attempts=100)=>{
    for(let i=0;i<attempts;i++){
      if(await evaluate(tab,expression))return;
      await sleep(100);
    }
    throw Error(`${label} did not become ready`);
  };
  const audit=await create(`chrome-extension://${loaded.id}/audit.html`);
  await waitFor(audit,"!!globalThis.api?.storage?.local",'Audit storage API');
  const hostileFixture='"\'\\\n</script><script>globalThis.injected=true</script>\u2028\u2029';
  await setStorage(audit,{'security:audit':hostileFixture},true);
  assert.equal(await evaluate(audit,"api.storage.local.get('security:audit').then(s=>s['security:audit'])"),hostileFixture);
  assert.equal(await evaluate(audit,"typeof globalThis.injected"),'undefined');
  const pgn='[White "Audit White"]\n[Black "Audit Black"]\n\n1. e4 e5 2. Nf3 Nc6 *';
  const payload={pgn,meta:{gameId:'layout-audit'},source:'pgn'};
  await setStorage(audit,{'job:audit':payload},true);
  const review=await create(`chrome-extension://${loaded.id}/analysis.html#audit`);
  const ready=async tab=>{
    for(let i=0;i<300;i++) {
      await sleep(100);
      if(await evaluate(tab,"!!document.querySelector('.board') && import('./analysis.js').then(m=>!m.S.analyzing)"))return;
      const error=await evaluate(tab,"document.querySelector('#error')?.textContent");
      if(error)throw Error(error);
    }
    throw Error('Review did not finish');
  };
  await ready(review);
  const fresh=await evaluate(review,"import('./analysis.js').then(m=>({engine:m.S.activeEngineBuild,error:m.S.analysisError,settings:m.S.settings}))");
  assert.equal(fresh.engine,'nnue');assert.equal(fresh.error,null);
  assert.equal(fresh.settings.enginePath,'sf19');
  const measure=`(async()=>{const m=await import('./analysis.js');const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};return {width:innerWidth,height:innerHeight,zoom:await chrome.tabs.getZoom(),mode:m.S.layoutMode,desktop:document.querySelector('.stage').classList.contains('desktop-layout'),board:rect(document.querySelector('.board')),scroll:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight},modules:[...document.querySelectorAll('.mod')].map(n=>({key:n.dataset.mod,...rect(n)})),error:document.querySelector('#error').textContent}})()`;
  const results=[];
  const capture=async(label)=>{
    const data=await evaluate(review,measure);
    assert.equal(data.error,'');
    assert.ok(Math.abs(data.board.w-data.board.h)<1,`${label}: board is not square`);
    assert.ok(data.scroll.w<=data.width+1,`${label}: horizontal overflow`);
    if(data.desktop||data.mode==='custom')assert.ok(data.scroll.h<=data.height+1,`${label}: vertical overflow`);
    results.push({label,...data});
    const screenshot=await call('Page.captureScreenshot',{format:'png'},review.sessionId);
    await fs.writeFile(path.join(out,label+'.png'),Buffer.from(screenshot.data,'base64'));
  };
  const {windowId}=await call('Browser.getWindowForTarget',{targetId:review.targetId});
  for(const [w,h] of [[1920,1080],[1366,768],[1536,864],[1280,720],[1280,800],[1440,900],[1470,956],[1536,960],[2560,1440],[3440,1440],[3840,2160],[1024,768],[820,768],[768,1024],[1280,480]]) {
    await call('Browser.setWindowBounds',{windowId,bounds:{width:w,height:h}});await sleep(700);
    await capture(`${w}x${h}`);
  }
  // Desktop Chrome enforces a minimum window width. Emulate smaller CSS viewports
  // separately to exercise the responsive CSS without pretending these are phones.
  for(const [w,h] of [[390,844],[320,640]]) {
    await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false},review.sessionId);await sleep(700);
    await capture(`viewport-${w}x${h}`);
    await evaluate(review,"document.querySelector('[aria-label=Settings]').click()");
    const settings=await evaluate(review,"(()=>{const r=document.querySelector('#settings').getBoundingClientRect();return {x:r.x,right:r.right,width:innerWidth}})()");
    assert.ok(settings.x>=0&&settings.right<=settings.width, 'Settings escapes narrow viewport');
    await evaluate(review,"document.querySelector('[aria-label=Settings]').click()");
  }
  await call('Emulation.clearDeviceMetricsOverride',{},review.sessionId);
  await call('Browser.setWindowBounds',{windowId,bounds:{width:1920,height:1080}});await sleep(700);
  await evaluate(review,"import('./analysis.js').then(m=>m.toggleReorganize())");await sleep(400);
  await capture('custom-layout');
  await call('Page.reload',{},review.sessionId);await ready(review);await sleep(500);
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m.S.layoutMode)"),'custom');
  await capture('custom-reloaded');
  await evaluate(review,"import('./analysis.js').then(m=>m.resetLayout())");await sleep(500);
  await capture('reset-layout');
  // Real module-worker integration, with the same disposable authored synthetic game.
  const scoreBefore=await evaluate(review,"import('./analysis.js').then(m=>JSON.stringify([m.S.evals,m.S.classif]))");
  await evaluate(review,"document.querySelector('[aria-label=\"Settings\"]').click()");
  const tabs=await evaluate(review,"[...document.querySelectorAll('.set-tab')].map(n=>n.textContent)");
  assert.deepEqual(tabs,['Visual','Engine','Concepts']);
  await evaluate(review,"document.querySelectorAll('.set-tab')[2].click()");
  assert.equal(await evaluate(review,"document.querySelector('#conceptsEnabled').checked"),false);
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession===null)"),true);
  await evaluate(review,"document.querySelector('#conceptsEnabled').click()");
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m.S.settings.conceptsEnabled)"),true);
  const navigationMs=await evaluate(review,"import('./analysis.js').then(m=>{const t=performance.now();m.go(3);document.querySelector('#concept-view-reply').click();document.querySelector('#concept-view-all').click();return performance.now()-t})");
  assert.ok(navigationMs<500,'Navigation and switching stalled the UI: '+navigationMs);
  await evaluate(review,"globalThis.__conceptTicks={last:performance.now(),max:0};globalThis.__conceptTickTimer=setInterval(()=>{const now=performance.now();__conceptTicks.max=Math.max(__conceptTicks.max,now-__conceptTicks.last);__conceptTicks.last=now;},25)");
  // Visit each move explicitly: unvisited moves must not consume proof-search work.
  const conceptStarted = Date.now();
  for (const ply of [1,2,3,4]) {
    await evaluate(review,`import('./analysis.js').then(m=>m.go(${ply}))`);
    await waitFor(review,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput()))?.status==='complete'})",'Selected concept worker',100);
  }
  const conceptWallMs = Date.now()-conceptStarted;
  const maxTickGapMs=await evaluate(review,"clearInterval(__conceptTickTimer);__conceptTicks.max");
  assert.ok(maxTickGapMs<1500,'Concept analysis froze the event loop: '+maxTickGapMs);
  const conceptMetrics=await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.metrics())");
  assert.equal(conceptMetrics.total,4);assert.ok(conceptMetrics.found>0);assert.deepEqual(conceptMetrics.errors,[]);
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>JSON.stringify([m.S.evals,m.S.classif]))"),scoreBefore);
  await evaluate(review,"import('./analysis.js').then(m=>m.go(3))");await sleep(150);
  await waitFor(review,"document.querySelector('.coach-insights-body')?.textContent.includes('Development')",'Selected concept redraw');
  assert.match(await evaluate(review,"document.querySelector('.coach-insights-body').textContent"),/Development/);
  await evaluate(review,"document.querySelector('#concept-group-pawns').click()");
  await waitFor(review,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput()))?.status==='complete'})",'Filtered concepts',100);
  assert.equal(await evaluate(review,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput())).stages.some(s=>s.detector==='E090')})"),false);
  await evaluate(review,"document.querySelector('#concept-group-pawns').click()");
  assert.equal(await evaluate(review,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput())).reused})"),true);
  await sleep(150);
  assert.match(await evaluate(review,"document.querySelector('.concepts-panel').textContent"),/Temporarily removed/);
  await evaluate(review,"document.querySelector('#conceptsExcluded').open = !document.querySelector('#conceptsExcluded').open");
  await capture('concepts-retired');
  await evaluate(review,"document.querySelector('#conceptsExcluded').open = false");
  await capture('concepts-wide');
  await evaluate(review,"document.querySelector('[data-concept-detail=\"group:features\"]').open=true");
  await waitFor(review,"!!document.querySelector('#concept-item-direct-attack')",'Expanded individual controls');
  await capture('concepts-individual');
  await evaluate(review,"document.querySelector('#concept-item-direct-attack').click()");
  await waitFor(review,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput()))?.status==='complete'})",'Individual toggle',100);
  assert.equal(await evaluate(review,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput())).findings.some(f=>f.event==='direct-attack')})"),false);
  await evaluate(review,"document.querySelector('#conceptsReset').click()");
  assert.equal(await evaluate(review,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput())).reused})"),true);
  await evaluate(review,"document.querySelector('[data-concept-detail=\"group:features\"]').open=false");
  await evaluate(review,"document.querySelector('[aria-label=\"Settings\"]').click()");
  const assertConceptAlignment=async()=>{
    const b=await evaluate(review,"(()=>{const rect=key=>document.querySelector('[data-mod=\"'+key+'\"]').getBoundingClientRect();const r=rect('review'),e=rect('engine'),c=rect('concepts');return {top:c.top-r.top,bottom:c.bottom-e.bottom,gap:c.left-e.right}})()");
    assert.ok(Math.abs(b.top)<1&&Math.abs(b.bottom)<1&&b.gap>0,'Concepts must align with the commentary top and Engine bottom: '+JSON.stringify(b));
  };
  await assertConceptAlignment();
  const selectedFindingCount=await evaluate(review,"(async()=>{const m=await import('./analysis.js'), {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput())).findings.length})()");
  assert.equal(await evaluate(review,"document.querySelectorAll('.coach-insight').length"),selectedFindingCount);
  await evaluate(review,"import('./analysis.js').then(m=>{m.S.playerKnown=true;m.go(3)})");
  assert.match(await evaluate(review,"document.querySelector('.coach-position').textContent"),/Playing White.*Your Nf3/);
  await capture('coach-wide');
  await evaluate(review,"import('./analysis.js').then(m=>{m.S.settings.engineLines=4;m.renderEngine(null)})");
  // Both main-panel views share the same completed cache and worker cost.
  const switchCost=await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.metrics().timeMs)");
  await evaluate(review,"document.querySelector('#concept-view-reply').click()");
  assert.equal(await evaluate(review,"document.querySelector('#concept-view-reply').getAttribute('aria-pressed')"),'true');
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.metrics().timeMs)"),switchCost);
  assert.equal(await evaluate(review,"document.querySelectorAll('.coach-insight').length"),1);
  assert.equal(await evaluate(review,"document.querySelector('.coach-perspective')"),null);
  assert.equal(await evaluate(review,"document.querySelector('.coach-move-quality')"),null);
  assert.equal(await evaluate(review,"document.querySelector('.coach-analysis-notes').open"),false);
  assert.match(await evaluate(review,"document.querySelector('.coach-takeaway').textContent"),/defenders.*opponent’s reply/);
  assert.match(await evaluate(review,"document.querySelector('.coach-insight > p').textContent"),/Your knight on f3.*attacks your opponent’s pawn on e5/);
  await capture('coach-reply-wide');
  await evaluate(review,"import('./analysis.js').then(m=>m.go(4))");
  assert.match(await evaluate(review,"document.querySelector('.coach-insight > p').textContent"),/opponent’s knight on c6.*defends the pawn on e5/);
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.metrics().timeMs)"),switchCost);
  await capture('coach-defense-wide');
  await evaluate(review,"document.querySelector('.coach-insight details').open=true");
  assert.match(await evaluate(review,"document.querySelector('.coach-insight details').textContent"),/Coach synthesis.*E200 \(provisional\)/s);
  await capture('coach-defense-evidence');
  await evaluate(review,"document.querySelector('.coach-insight details').open=false");
  await evaluate(review,"import('./analysis.js').then(m=>m.go(3))");
  await evaluate(review,"document.querySelector('#concept-view-all').click()");
  assert.equal(await evaluate(review,"document.querySelectorAll('.coach-insight').length"),selectedFindingCount);
  await assertConceptAlignment(); await capture('concepts-engine-four-lines');
  await evaluate(review,"import('./analysis.js').then(m=>{m.S.settings.engineLines=2;m.S.qbreakExpanded=true;m.renderStats();m.renderEngineCurrent()})");
  await assertConceptAlignment(); await capture('concepts-accuracy-expanded');
  await evaluate(review,"import('./analysis.js').then(m=>{m.S.qbreakExpanded=false;m.renderStats()})");
  await assertConceptAlignment();
  await evaluate(review,"import('./analysis.js').then(m=>{m.S.meSide='b';m.S.playerKnown=true;m.go(2);m.go(3)})");
  assert.match(await evaluate(review,"document.querySelector('.coach-position').textContent"),/Playing Black.*Opponent’s Nf3/);
  await evaluate(review,"document.querySelector('#concept-view-reply').click()");
  assert.match(await evaluate(review,"document.querySelector('.coach-insight > p').textContent"),/opponent’s knight on f3.*attacks your pawn on e5/);
  await capture('coach-reply-black');
  await evaluate(review,"document.querySelector('#concept-view-all').click()");
  await capture('coach-black');
  for(const width of [390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false},review.sessionId);await sleep(500);
    await evaluate(review,"document.querySelector('.coach-insights-panel').scrollIntoView({block:'center'})");
    const coachBox=await evaluate(review,"(()=>{const panel=document.querySelector('.coach-insights-panel'),mod=panel.closest('.mod'),body=panel.querySelector('.coach-insights-body');return {panel:panel.getBoundingClientRect().height,module:mod.getBoundingClientRect().height,body:body.clientHeight,scrolls:body.scrollHeight>body.clientHeight}})()");
    assert.ok(coachBox.panel<=coachBox.module+1&&coachBox.body>100&&coachBox.scrolls,`Coach ${width}: list must scroll inside its box`);
    await capture(`coach-${width}`);
    await evaluate(review,"document.querySelector('#concept-view-reply').click()");
    const replyBox=await evaluate(review,"(()=>{const body=document.querySelector('.coach-reply-body');return {client:body.clientWidth,scroll:body.scrollWidth}})()");
    assert.ok(replyBox.scroll<=replyBox.client,`Coach reply ${width}: no horizontal overflow`);
    await capture(`coach-reply-${width}`);
    await evaluate(review,"document.querySelector('#concept-view-all').click()");
  }
  await call('Emulation.clearDeviceMetricsOverride',{},review.sessionId);
  await evaluate(review,"window.scrollTo(0,0)");
  await evaluate(review,"import('./analysis.js').then(m=>{m.go(0)})");
  assert.equal(await evaluate(review,"document.querySelectorAll('.coach-insight').length"),0);
  await evaluate(review,"import('./analysis.js').then(m=>{m.S.meSide='w';m.go(3)})");
  await evaluate(review,"document.querySelector('[aria-label=\"Settings\"]').click()");
  for(const width of [390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false},review.sessionId);await sleep(400);
    const bounds=await evaluate(review,"(()=>{const r=document.querySelector('#settings').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,scroll:document.documentElement.scrollWidth}})()");
    assert.ok(bounds.left>=0&&bounds.right<=bounds.width&&bounds.scroll<=bounds.width,`Concepts overflow at ${width}`);
    await capture(`concepts-${width}`);
  }
  await call('Emulation.clearDeviceMetricsOverride',{},review.sessionId);await sleep(400);
  await evaluate(review,"document.querySelector('#conceptsEnabled').click()");
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.worker===null&&m._conceptSession.queue.length===0)"),true);
  const timeBefore=await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.metrics().timeMs)");
  await evaluate(review,"document.querySelector('#conceptsEnabled').click()");
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.metrics().reused)"),4);
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.metrics().timeMs)"),timeBefore);
  await evaluate(review,"import('./analysis.js').then(m=>m.applyGame({pgn:'1. d4 d5 *',meta:{gameId:'concept-switch'},source:'pgn'}))");
  await waitFor(review,"import('./analysis.js').then(m=>!m.S.analyzing)",'Switched game engine',600);
  await evaluate(review,"import('./analysis.js').then(m=>m.go(1))");
  await waitFor(review,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput()))?.status==='complete'})",'Switched concept game',100);
  assert.equal(await evaluate(review,"import('./analysis.js').then(m=>m._conceptSession.metrics().total)"),2);
  await evaluate(review,"document.querySelector('#conceptsEnabled').click()");
  await evaluate(review,"document.querySelector('[aria-label=\"Settings\"]').click()");
  results.push({label:'concept-worker',...conceptMetrics,conceptWallMs,navigationMs,maxTickGapMs});
  // Actual imported identity, deliberately opposite board orientation. Inspect a
  // meaningful reply in both colors rather than only an empty opening position.
  for (const fixture of [
    {color:'w',fen:'7k/p7/5KQ1/8/8/8/8/8 b - - 0 1',move:'1... a6',name:'Audit White'},
    {color:'b',fen:'8/8/8/8/8/5kq1/P7/7K w - - 0 1',move:'1. a3',name:'Audit Black'},
  ]) {
    const tactical={pgn:'[White "Audit White"]\n[Black "Audit Black"]\n[SetUp "1"]\n[FEN "'+fixture.fen+'"]\n\n'+fixture.move+' *',meta:{gameId:'coach-'+fixture.color,myName:fixture.name,flip:fixture.color==='w'},source:'pgn'};
    await setStorage(audit,{'job:coach-tactic':tactical});
    const tacticalTab=await create(`chrome-extension://${loaded.id}/analysis.html#coach-tactic`);
    await ready(tacticalTab);
    await evaluate(tacticalTab,"import('./analysis.js').then(m=>m.go(1))");
    await evaluate(tacticalTab,"document.querySelector('#coachEnable')?.click()");
    await waitFor(tacticalTab,"import('./analysis.js').then(m=>m._conceptSession.metrics().processed===1)",'Tactical concept worker',600);
    await evaluate(tacticalTab,"document.querySelector('#concept-view-reply').click()");
    assert.match(await evaluate(tacticalTab,"document.querySelector('.coach-insight > p').textContent"),/You can now play .* for mate in one/);
    assert.match(await evaluate(tacticalTab,"document.querySelector('.coach-position').textContent"),fixture.color==='w'?/Playing White.*Opponent’s/:/Playing Black.*Opponent’s/);
    assert.equal(await evaluate(tacticalTab,"import('./analysis.js').then(m=>m.S.flipped)"),fixture.color==='w');
    const metrics=await evaluate(tacticalTab,"import('./analysis.js').then(m=>m._conceptSession.metrics())");assert.deepEqual(metrics.errors,[]);
    if(fixture.color==='b'){await call('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:false},tacticalTab.sessionId);await sleep(500);await evaluate(tacticalTab,"document.querySelector('.coach-insights-panel').scrollIntoView({block:'center'})");}
    assert.equal(await evaluate(tacticalTab,"document.querySelectorAll('.coach-insight').length"),1);
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},tacticalTab.sessionId);await fs.writeFile(path.join(out,'coach-tactical-'+fixture.color+'.png'),Buffer.from(shot.data,'base64'));
    results.push({label:'coach-tactical-'+fixture.color,...metrics});
    await call('Target.closeTarget',{targetId:tacticalTab.targetId});
  }
  // The requested game segment runs through the packaged worker and real UI.
  for(const fixture of [
    {id:'fork-story',fen:'rn3rk1/2q2ppp/2p1pn2/p1N5/1pQP4/4P3/PPP3PP/3RK1NR b K - 4 16',moves:'16... Nd5 17. e4 Nb6',plies:[1,2,3],patterns:[/knight on d5.*Nxe3.*queen on c4.*rook on d1/,/pawn on e4.*still able to jump to e3/,/chooses Nb6 instead of the available Ne3/]},
    {id:'pawn-capture',fen:'4rrk1/7p/2p3p1/p1PnNp2/1p1P4/8/PP4PP/3R1RK1 w - - 0 29',moves:'29. Nxc6',plies:[1],patterns:[/knight on c6 takes.*pawn on c6.*every immediate reply/]},
  ]){
    const payload={pgn:'[White "Audit White"]\n[Black "Audit Black"]\n[SetUp "1"]\n[FEN "'+fixture.fen+'"]\n\n'+fixture.moves+' *',meta:{gameId:fixture.id,myName:'Audit White',flip:true},source:'pgn'};
    await setStorage(audit,{['job:'+fixture.id]:payload});
    const tab=await create(`chrome-extension://${loaded.id}/analysis.html#${fixture.id}`);await ready(tab);
    await evaluate(tab,"document.querySelector('#coachEnable')?.click()");
    await evaluate(tab,"document.querySelector('#concept-view-reply').click()");
    for(const [index,ply] of fixture.plies.entries()){
      await evaluate(tab,`import('./analysis.js').then(m=>m.go(${ply}))`);
      await waitFor(tab,"import('./analysis.js').then(async m=>{const {conceptKey}=await import('./lib/concepts/session.js');return m._conceptSession.entries.get(conceptKey(m.selectedConceptInput()))?.status==='complete'})",fixture.id,200);
      await sleep(150);assert.match(await evaluate(tab,"document.querySelector('.coach-insight > p').textContent"),fixture.patterns[index]);
    }
    const cost=await evaluate(tab,"import('./analysis.js').then(m=>m._conceptSession.metrics().timeMs)");
    await evaluate(tab,"document.querySelector('#concept-view-all').click()");
    assert.equal(await evaluate(tab,"import('./analysis.js').then(m=>m._conceptSession.metrics().timeMs)"),cost);
    await evaluate(tab,"document.querySelector('#concept-view-reply').click()");
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},tab.sessionId);await fs.writeFile(path.join(out,fixture.id+'.png'),Buffer.from(shot.data,'base64'));
    if(fixture.id==='fork-story'){
      await evaluate(tab,"import('./analysis.js').then(m=>{m.S.meSide='b';m.S.playerKnown=true;m.go(2);m.go(3)})");
      assert.match(await evaluate(tab,"document.querySelector('.coach-insight > p').textContent"),/You choose Nb6.*opponent’s queen on c4/);
      assert.equal(await evaluate(tab,"import('./analysis.js').then(m=>m._conceptSession.metrics().timeMs)"),cost);
    }
    const metrics=await evaluate(tab,"import('./analysis.js').then(m=>m._conceptSession.metrics())");assert.deepEqual(metrics.errors,[]);results.push({label:fixture.id,...metrics});
    await call('Target.closeTarget',{targetId:tab.targetId});
  }
  const popup=await create(`chrome-extension://${loaded.id}/popup.html`);
  await waitFor(popup,"!!document.querySelector('#manual')",'Popup');
  await call('Emulation.setDeviceMetricsOverride',{width:318,height:600,deviceScaleFactor:1,mobile:false},popup.sessionId);
  const popupSize=await evaluate(popup,"(()=>{document.querySelector('#manual').open=true;return {width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.body.scrollHeight}})()");
  assert.ok(popupSize.scroll<=popupSize.width&&popupSize.height<=600,'Expanded popup overflows');
  const legacy={enginePath:'sf19',engineDepth:8,engineWorkers:1,depthBumped:true,coach:'professor',coachDefaulted:true,coachPlain:true,soundVolume:37,boardTheme:'kada_green',pieceStyle:'chesscom',badgeFont:'original',badgeDecimals:true};
  await setStorage(audit,{settings:legacy,layoutVersion:7,'job:upgrade':payload});
  const upgraded=await create(`chrome-extension://${loaded.id}/analysis.html#upgrade`);await ready(upgraded);
  const migrated=await evaluate(upgraded,"import('./analysis.js').then(m=>({settings:m.S.settings,layoutMode:m.S.layoutMode,engine:m.S.activeEngineBuild,library:m.S.library.length}))");
  for(const [key,value] of Object.entries({enginePath:'sf19lite',boardTheme:'green',pieceStyle:'image',badgeFont:'spacemono',coach:'professor',soundVolume:37}))assert.equal(migrated.settings[key],value,`Update preference: ${key}`);
  assert.equal(migrated.layoutMode,'auto');assert.equal(migrated.engine,'sf19lite');assert.ok(migrated.library>0);
  assert.equal(await evaluate(review,"typeof navigator.locks?.request"),'function');
  await Promise.all([
    evaluate(review,"import('./analysis.js').then(m=>m.updateLibrary(library=>[{...library[0],id:'audit-a'},...library]))"),
    evaluate(upgraded,"import('./analysis.js').then(m=>m.updateLibrary(library=>[{...library[0],id:'audit-b'},...library]))"),
  ]);
  const savedIds=await evaluate(audit,"api.storage.local.get('library').then(s=>s.library.map(r=>r.id))");
  assert.ok(savedIds.includes('audit-a')&&savedIds.includes('audit-b'),'Concurrent tabs lost a library entry');
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,chromeVersion:await call('Browser.getVersion'),sourceRecord:recordPath,results,popup:popupSize,fresh,upgrade:migrated},null,2));
  console.log(`Passed ${results.length} layout cases, expanded popup, refresh/reset, legacy update, and concurrent library writes. Screenshots and measurements: ${out}`);
} finally {clearInterval(keepAlive);ws?.close();chrome.kill();}

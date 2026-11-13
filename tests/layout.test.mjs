import test from 'node:test';
import assert from 'node:assert/strict';
import { app, loadGame, settle } from './helpers/app.mjs';

function layout(t, initialZoom = 1, defaultZoom = 1) {
  const a = app(t); loadGame(a, '1. e4 e5');
  a.call('computeDerived'); a.call('buildUI'); a.call('renderAll');
  let zoom = initialZoom, size;
  const syncViewport = () => {
    if (!size) return;
    a.context.innerWidth = Math.round(size.w / zoom);
    a.context.innerHeight = Math.round(size.h / zoom);
  };
  const changes = [];
  a.context.browserAPI.tabs = {
    getCurrent: async () => ({ id: 7 }),
    getZoomSettings: async () => ({ defaultZoomFactor: defaultZoom }),
    setZoomSettings: async () => {},
    getZoom: async () => zoom,
    setZoom: async (id, value) => { assert.equal(id, 7); changes.push(value); zoom = value; syncViewport(); },
  };
  const viewport = (w, h) => {
    size = {w, h}; syncViewport();
  };
  return { ...a, viewport, changes, zoom: () => zoom,
    desktop: () => a.dom.window.document.querySelector('.stage').classList.contains('desktop-layout') };
}


test('automatic workspace keeps readable browser zoom and a grouped sidebar', async t => {
  const a = layout(t, .65); a.viewport(1536, 720); await a.call('initTabZoom');
  assert.equal(a.zoom(), 1); assert.equal(a.desktop(), false);
  const doc=a.dom.window.document;
  assert.equal(doc.querySelectorAll('.workspace-board > .mod').length,2);
  assert.deepEqual([...doc.querySelector('.analysis-column').children].map(n=>n.dataset.mod),['review','coach','accuracy','moves','controls','engine','graph']);
  assert.deepEqual([...doc.querySelector('.insights-column').children].map(n=>n.dataset.mod),['concepts','learn']);
  for(const mod of doc.querySelectorAll('.mod'))assert.equal(mod.style.left,'');
  a.viewport(1920,1080);await a.call('fitTabZoom');
  a.viewport(390,844);await a.call('fitTabZoom');
  assert.equal(a.zoom(),1);assert.deepEqual(a.changes,[1]);
});

for (const [width,height] of [[1920,1080],[1366,768],[1536,864],[1280,720],[2560,1440],[1470,956],[1024,768],[820,768],[390,844],[320,640]]) {
  test(`${width} × ${height} retains readable auto zoom and fits saved custom canvases`,async t=>{
    const a=layout(t,.9);a.viewport(width,height);await a.call('initTabZoom');
    assert.equal(a.zoom(),1);
    await a.call('resetLayout');assert.equal(a.zoom(),1);
    a.state.layoutMode='custom';a.call('applyLayoutMode');await a.call('initTabZoom');
    const page=a.call('layoutPageSize',a.state.layout),z=a.zoom();
    if(width>=1100&&height>=600){assert.ok(page.pageW*z<=width);assert.ok(page.pageH*z<=height);}
    assert.equal(a.desktop(),false);
  });
}

test('graph and breakdown use native disclosures and retain their open state during refresh',t=>{
  const a=layout(t),doc=a.dom.window.document;
  const graph=doc.querySelector('.graph-disclosure'),breakdown=doc.querySelector('.accuracy-breakdown');
  assert.equal(graph.open,false);assert.equal(breakdown.open,true);
  graph.open=true;breakdown.open=true;
  a.call('renderGraph');a.call('renderStats');
  assert.equal(doc.querySelector('.graph-disclosure'),graph);
  assert.equal(doc.querySelector('.accuracy-breakdown').open,true);
  assert.ok(graph.querySelector('svg'));
  doc.querySelector('.qbreak-toggle').click();
  assert.equal(doc.querySelectorAll('.qbreak-row').length,10);
  assert.equal(doc.querySelector('.accuracy-breakdown').open,true);
  assert.ok(doc.querySelector('.practice-btn'));assert.ok(doc.querySelector('.learn-entry-button'));
  doc.querySelector('.accuracy-breakdown').open=false;a.call('renderStats');
  assert.equal(doc.querySelector('.accuracy-breakdown').open,false);
});

test('hiding Concepts preserves commentary and learning in the insights group',t=>{
  const a=layout(t),doc=a.dom.window.document;
  a.state.settings.showConcepts=false;a.call('applyLayout');
  assert.equal(doc.querySelector('[data-mod="concepts"]').hidden,true);
  assert.ok(doc.querySelector('.analysis-column #reviewMount'));
  assert.ok(doc.querySelector('.insights-column .learn-entry-button'));
  a.state.settings.showConcepts=true;a.call('applyLayout');
  assert.equal(doc.querySelector('[data-mod="concepts"]').hidden,false);
});

test('custom canvas coordinates and accuracy reflow retain their existing behavior',t=>{
  const a=layout(t);a.state.layoutMode='custom';
  Object.defineProperty(a.dom.window.HTMLElement.prototype,'offsetHeight',{configurable:true,get(){return this.classList.contains('qbreak-row')?22:0;}});
  a.context.getComputedStyle=()=>({rowGap:'7px'});
  a.call('applyLayoutMode');a.call('reflowAccuracy',false);
  const mod=key=>a.dom.window.document.querySelector(`[data-mod="${key}"]`).style;
  assert.equal(mod('engine').top,'620px');assert.equal(mod('accuracy').height,'390px');
  a.state.qbreakExpanded=true;a.call('renderStats');a.call('reflowAccuracy',true);
  assert.equal(mod('engine').top,'736px');assert.equal(mod('accuracy').height,'506px');
});

test('Reorganize snapshots the current responsive boxes and Reset restores auto layout',async t=>{
  const a=layout(t);a.viewport(1536,720);await a.call('initTabZoom');
  const doc=a.dom.window.document,stage=doc.querySelector('.stage');
  stage.getBoundingClientRect=()=>({left:0,top:60});
  let i=0;for(const mod of stage.querySelectorAll('.mod')){const n=i++;mod.getBoundingClientRect=()=>({left:20+n*10,top:80+n*10,width:200,height:180});}
  a.call('toggleReorganize');assert.equal(a.state.layoutMode,'custom');
  assert.equal(a.state.reorganize,true);assert.equal(a.state.layout.board.w,200);
  assert.equal(doc.querySelector('[data-mod="board"]').style.width,'200px');
  await a.call('resetLayout');assert.equal(a.state.layoutMode,'auto');assert.equal(a.zoom(),1);
  assert.equal(doc.querySelector('[data-mod="board"]').style.width,'');
});

test('small custom canvases retain their own bounds',async t=>{
  const a=layout(t);a.state.layoutMode='custom';a.state.layout={board:{x:36,y:0,w:640,h:760}};
  a.call('applyLayoutMode');a.viewport(768,900);await a.call('initTabZoom');
  const stage=a.dom.window.document.querySelector('.stage');assert.equal(stage.style.minWidth,'688px');assert.equal(a.zoom(),1.07);
});

test('automatic layout honors browser default zoom and retries a failed zoom write',async t=>{
  const a=layout(t,.89,1.25);a.viewport(1536,720);const tabs=a.context.browserAPI.tabs,setZoom=tabs.setZoom;
  tabs.setZoom=async()=>{throw Error('Temporary tab error');};await a.call('initTabZoom');
  tabs.setZoom=setZoom;await a.call('fitTabZoom');assert.equal(a.zoom(),1.25);
  await a.call('resetLayout');assert.equal(a.zoom(),1.25);
});

test('custom engine panels retain their minimum resize height',t=>{
  const a=layout(t);a.state.layoutMode='custom';a.call('applyLayoutMode');
  const mod=a.dom.window.document.querySelector('[data-mod="engine"]'),head=mod.querySelector('.panel-head'),body=mod.querySelector('.engine-body');
  head.getBoundingClientRect=()=>({height:40.5});Object.defineProperty(body,'scrollHeight',{configurable:true,value:250});
  a.call('fitEnginePanel');assert.equal(mod.style.height,'296px');
  const grip=mod.querySelector('.mod-resize.s');
  for(const [type,y] of [['pointerdown',300],['pointermove',0],['pointerup',0]])grip.dispatchEvent(new a.dom.window.MouseEvent(type,{clientY:y,bubbles:true}));
  assert.equal(a.state.layout.engine.h,296);
});


test('sidebar switching preserves modules and custom layouts restore both views', t => {
  const a = layout(t), doc = a.dom.window.document;
  const review = doc.querySelector('.analysis-column'), insights = doc.querySelector('.insights-column');
  const moves = doc.querySelector('#movesBody');
  assert.equal(review.inert, false); assert.equal(insights.inert, true);
  doc.querySelector('button[data-sidebar-view="insights"]').click();
  assert.equal(review.inert, true); assert.equal(insights.inert, false);
  assert.equal(doc.querySelector('button[data-sidebar-view="insights"]').getAttribute('aria-pressed'), 'true');
  a.state.layoutMode = 'custom'; a.call('applyLayoutMode');
  assert.equal(review.inert, false); assert.equal(insights.inert, false);
  a.state.layoutMode = 'auto'; a.call('applyLayoutMode');
  assert.equal(review.inert, true); assert.equal(insights.inert, false);
  doc.querySelector('button[data-sidebar-view="review"]').click();
  assert.equal(review.inert, false); assert.equal(insights.inert, true);
  assert.equal(doc.querySelector('#movesBody'), moves);
});

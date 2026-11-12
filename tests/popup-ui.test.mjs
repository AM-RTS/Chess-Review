import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { settle,deferred } from './helpers/app.mjs';
import {createImportRequest} from '../lib/import-request.js';

test('popup offers an independent analysis board and still submits review PGN',async t=>{
  const html=fs.readFileSync(new URL('../popup.html',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../popup.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const dom=new JSDOM(html,{url:'https://extension.test/popup.html'}),opened=[];
  const close=dom.window.close.bind(dom.window);t.after(close);
  const document=dom.window.document;dom.window.close=()=>{};
  const context=vm.createContext({document,window:dom.window,console,createImportRequest,
    browserAPI:{runtime:{getURL:p=>'https://extension.test/'+p},storage:{local:{async get(){return {};}}},tabs:{async query(){return [{url:'https://example.test/'}];},async create(tab){opened.push(tab);}}},
    isSupportedChessUrl:()=>false,
    openAnalysisTab:async payload=>{opened.push(payload);},
  });
  vm.runInContext(source,context);await settle();
  assert.equal(document.getElementById('exploreMode'),null);
  assert.doesNotMatch(document.body.textContent,/Explore board|or FEN/i);
  assert.doesNotMatch(document.getElementById('manualInput').placeholder,/FEN/i);
  assert.match(document.getElementById('status').textContent,/URL or PGN/);
  document.getElementById('openBoard').click();await settle();
  assert.equal(opened.pop().url,'https://extension.test/analysis.html#analysis');
  document.getElementById('manualInput').value='1. e4 e5';
  document.getElementById('analyzeManual').click();await settle();
  assert.equal(opened.length,1);assert.equal(opened[0].pgn,'1. e4 e5');assert.equal(opened[0].source,'pgn');
});

test('Cancel import immediately enables retry and ignores the canceled operation\'s late result',async t=>{
  const html=fs.readFileSync(new URL('../popup.html',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../popup.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const dom=new JSDOM(html,{url:'https://extension.test/popup.html'}),requests=[];t.after(()=>dom.window.close());let closed=0;
  dom.window.close=()=>{closed++;};const document=dom.window.document;
  const context=vm.createContext({document,window:dom.window,console,createImportRequest,
    browserAPI:{storage:{local:{async get(){return {};}}},tabs:{async query(){return [{url:'https://example.test/'}];}}},
    isSupportedChessUrl:()=>false,
    openAnalysisTab:(_payload,{signal})=>{const job=deferred();requests.push({job,signal});return job.promise;},
  });
  vm.runInContext(source,context);await settle();document.getElementById('manualInput').value='1. e4 e5';
  const start=document.getElementById('analyzeManual'),cancel=document.getElementById('cancelImport');start.click();await settle();
  assert.equal(start.disabled,true);assert.equal(cancel.hidden,false);cancel.click();assert.equal(requests[0].signal.aborted,true);assert.equal(start.disabled,false);assert.equal(cancel.hidden,true);
  start.click();await settle();requests[0].job.resolve();await settle();assert.equal(closed,0);assert.equal(start.disabled,true);
  requests[1].job.resolve();await settle();assert.equal(closed,1);assert.equal(start.disabled,false);
});

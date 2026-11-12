import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,branch,settle} from './helpers/app.mjs';

for(const mode of ['review','live'])test(`Forced uses the supplied board marker but stays Best in ${mode}`,t=>{
 const a=app(t),S=loadGame(a,'[SetUp "1"]\n[FEN "k5rr/8/8/8/8/3B4/8/7K w - - 0 1"]\n\n1. Bh7');
 a.call('computeDerived');S.idx=1;
 if(mode==='live'){branch(a);a.call('classifyVariationMoves');}
 a.call('buildUI');a.call('renderAll');
 const doc=a.dom.window.document,badge=doc.querySelector('.sq-badge');
 assert.equal(S.classif[1],'best');assert.equal(S.counts.w.best,1);
 assert.equal(badge.getAttribute('aria-label'),'Forced');
 assert.equal(badge.querySelector('image').getAttribute('href'),'icons/chesseditpack/forced.png');
 S.qbreakExpanded=true;a.call('renderStats');
 assert.equal(doc.querySelectorAll('.qbreak-row').length,10);assert.equal(doc.querySelector('.qbreak [data-category="forced"]'),null);
 S.settings.badgeDesign='points';a.call('paintBoard');
 assert.equal(doc.querySelector('.sq-badge image').getAttribute('href'),'icons/chesseditpack/forced.png');
 if(mode==='live') assert.equal(S.variation.positions[1].classif,'best');
});

test('Forced has a generated hover label without adding a stored breakdown category',async t=>{
 const a=app(t),S=loadGame(a,'[SetUp "1"]\n[FEN "k5rr/8/8/8/8/3B4/8/7K w - - 0 1"]\n\n1. Bh7');
 a.context.categoryLabelPng=(document,name,color)=>{assert.equal(name,'Forced');assert.equal(color,'#96af8b');return 'data:image/png;base64,Zm9yY2Vk';};
 S.settings.badgeTooltip='original';S.idx=1;a.call('computeDerived');a.call('buildUI');a.call('renderAll');await settle();
 const tip=a.dom.window.document.getElementById('boardBadgeTip');
 assert.equal(tip.getAttribute('aria-label'),'Forced');assert.equal(tip.querySelector('img').src,'data:image/png;base64,Zm9yY2Vk');
});

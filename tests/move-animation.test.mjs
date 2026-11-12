import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,branch,settle} from './helpers/app.mjs';

function board(t,pgn) {
 const a=app(t);loadGame(a,pgn);a.call('computeDerived');a.call('buildUI');a.call('renderAll');
 a.state.settings.moveAnim=true;
 a.replace('navFastScrub',()=>false);a.replace('requestLiveEval',()=>{});
 const animations=[];
 a.dom.window.HTMLElement.prototype.animate=function(frames,options){
  let finish;const animation={node:this,frames,options,cancelled:false,finished:new Promise(r=>finish=r),cancel(){this.cancelled=true;finish();},finish};
  animations.push(animation);return animation;
 };
 a.dom.window.HTMLElement.prototype.getAnimations=function(){return animations.filter(a=>a.node===this&&!a.cancelled);};
 for(const [name,square]of Object.entries(a.run('sqByName')))square.getBoundingClientRect=()=>({left:(name.charCodeAt(0)-97)*100,top:(8-Number(name[1]))*100,width:100,height:100});
 const nativeRect=a.dom.window.HTMLElement.prototype.getBoundingClientRect;
 a.dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
  if(!this.classList.contains('sq-badge'))return nativeRect.call(this);
  const r=this.parentElement.getBoundingClientRect(),size=42*(a.state.settings.badgeScale??1);
  return {left:r.left+(this.parentElement.classList.contains('right-col')?79:93)-size/2,
    top:r.top+(this.parentElement.classList.contains('top-row')?22:7)-size/2,width:size,height:size};
 };
 return {...a,animations};
}
const slides=a=>a.animations.filter(n=>n.frames[0].transform?.startsWith('translate(')&&n.frames.at(-1).transform==='translate(0, 0)');

test('forward and reverse navigation use reference timing and easing',t=>{
 const a=board(t,'1. e4 e5');a.call('go',1);
 assert.equal(slides(a).length,1);assert.equal(slides(a)[0].options.duration,180);assert.equal(slides(a)[0].options.easing,'ease-in-out');
 assert.equal(slides(a)[0].frames[0].transform,'translate(0px, 200px)');
 a.call('go',0);assert.equal(slides(a).at(-1).frames[0].transform,'translate(0px, -200px)');
 assert.equal(slides(a)[0].cancelled,true);
});

for(const [name,pgn,before,after,capture]of [
 ['capture','1. e4 d5 2. exd5',2,3,'d5'],
 ['en passant','1. e4 a6 2. e5 d5 3. exd6',4,5,'d5'],
])test(name+' fades the captured piece and restores it on undo',async t=>{
 const a=board(t,pgn);a.call('go',before);a.call('go',after);
 const ghost=a.dom.window.document.querySelector('.capture-ghost');assert.ok(ghost);assert.equal(ghost.parentElement,a.run('sqByName')[capture]);
 const fade=a.animations.find(n=>n.node===ghost);assert.deepEqual(Array.from(fade.frames,f=>f.opacity),[1,0]);
 assert.equal(fade.options.duration,180);a.call('paintBoard');assert.equal(ghost.isConnected,true);
 a.call('go',before);assert.equal(ghost.isConnected,false);
 assert.ok(a.animations.some(n=>n.node.dataset.piece==='bP'&&n.frames[0].opacity===0));
 await settle();assert.equal(a.dom.window.document.querySelector('.capture-ghost'),null);
});

test('castling slides both king and rook forward and backward',t=>{
 const a=board(t,'1. Nf3 Nf6 2. g3 g6 3. Bg2 Bg7 4. O-O O-O');
 a.call('go',6);a.call('go',7);assert.deepEqual(slides(a).map(n=>n.node.dataset.piece),['wK','wR']);
 a.call('go',6);assert.deepEqual(slides(a).slice(-2).map(n=>n.node.dataset.piece),['wK','wR']);
});

test('live moves and single-step variation selection use the same animation path',t=>{
 const a=board(t,'1. e4 e5');const v=branch(a,0,0);
 a.call('gotoVar',1);assert.equal(slides(a).length,1);
 a.call('gotoVar',0);assert.equal(slides(a).length,2);
 a.call('applyUserMove','d2','d4');assert.equal(slides(a).length,3);assert.equal(v.positions[1].san,'d4');
});

test('drag release, disabled animation and reduced motion do not slide pieces',t=>{
 const a=board(t,'1. e4 e5');branch(a,0,0);
 a.call('applyUserMove','d2','d4',false);assert.equal(slides(a).length,0);
 a.dom.window.matchMedia=()=>({matches:true});a.call('gotoVar',0);assert.equal(a.animations.length,0);
 a.dom.window.matchMedia=()=>({matches:false});a.state.settings.moveAnim=false;a.call('gotoVar',1);assert.equal(a.animations.length,0);
});

test('feedback grows and settles once; analysis refresh does not restart it',t=>{
 const a=board(t,'1. e4 e5');a.state.classif[1]='great';a.call('go',1);
 const badge=a.animations.find(n=>n.node.classList.contains('sq-badge'));assert.ok(badge);assert.equal(badge.options.duration,1300);
 a.call('paintBoard');assert.equal(a.animations.filter(n=>n.node.classList.contains('sq-badge')).length,1);
 a.call('go',0);assert.equal(badge.cancelled,true);
});

test('rapid recaptures cancel old motion without clearing the new moving square',async t=>{
 const a=board(t,'1. e4 d5 2. exd5 Qxd5');a.call('go',2);a.call('go',3);a.call('go',4);
 await settle();assert.equal(a.run('sqByName').d5.classList.contains('anim-top'),true);
 assert.equal(slides(a).at(-1).node.dataset.piece,'bQ');
 assert.equal(a.dom.window.document.querySelectorAll('.capture-ghost').length,1);
});

test('promotion reaches the correct piece and board flipping reverses slide geometry',t=>{
 const a=board(t,'[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+');a.call('go',1);
 assert.equal(slides(a)[0].node.dataset.piece,'wQ');
 a.call('go',0);a.state.flipped=true;a.call('buildBoard');
 for(const [name,square]of Object.entries(a.run('sqByName')))square.getBoundingClientRect=()=>({left:(7-(name.charCodeAt(0)-97))*100,top:(Number(name[1])-1)*100,width:100,height:100});
 a.call('go',1);assert.equal(slides(a).at(-1).frames[0].transform,'translate(0px, -100px)');
});

for(const category of ['great','brilliant'])test(category+' feedback uses its category color and reference phase timing',async t=>{
 const a=board(t,'1. e4 e5');a.state.classif[1]=category;a.call('go',1);
 const badge=a.animations.find(n=>n.node.classList.contains('sq-badge'));
 assert.equal(badge.options.easing,'linear');assert.equal(badge.frames[1].offset,3/13);assert.equal(badge.frames[2].offset,10/13);
 const flash=a.dom.window.document.querySelector('.move-feedback-square');assert.ok(flash);assert.equal(flash.style.background,'var(--q-'+category+')');
 const effect=a.animations.find(n=>n.node===flash);assert.equal(effect.options.duration,1300);assert.equal(effect.frames[1].opacity,.8);
 a.call('paintBoard');assert.equal(a.dom.window.document.querySelectorAll('.move-feedback-square').length,1);
 effect.finish();await settle();assert.equal(flash.isConnected,false);
});

test('late live feedback animates once and category upgrades keep one matching flash',t=>{
 const a=board(t,'1. e4 e5');const v=branch(a,0,1);a.call('paintBoard');
 v.positions[1].classif='great';a.call('paintBoard');
 assert.equal(a.animations.filter(n=>n.node.classList.contains('sq-badge')).length,1);
 a.call('paintBoard');assert.equal(a.animations.filter(n=>n.node.classList.contains('sq-badge')).length,1);
 v.positions[1].classif='brilliant';a.call('paintBoard');
 const flashes=a.dom.window.document.querySelectorAll('.move-feedback-square');assert.equal(flashes.length,1);assert.equal(flashes[0].style.background,'var(--q-brilliant)');
});


test('badge starts over its own piece even when the corner is tucked or scaled',t=>{
 const a=board(t,'[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+');
 a.state.settings.badgeScale=1.5;a.state.classif[1]='great';a.call('go',1);
 const badge=a.animations.find(n=>n.node.classList.contains('sq-badge'));
 const corner=badge.node.getBoundingClientRect(),square=badge.node.parentElement.getBoundingClientRect();
 const [x,y]=badge.frames[1].transform.match(/translate\(([-.\d]+)px, ([-.\d]+)px\)/).slice(1).map(Number);
 assert.equal(corner.left+corner.width/2+x,square.left+square.width/2);
 assert.equal(corner.top+corner.height/2+y,square.top+square.height*.625);
});


for(const category of ['best','excellent','good','book','inacc','mistake','miss','blunder','forced'])test(category+' has a static badge while the piece still slides',t=>{
 const a=board(t,'1. e4 e5');a.state.classif[1]=category;a.call('go',1);
 assert.equal(slides(a).length,1);
 assert.equal(a.animations.some(n=>n.node.classList.contains('sq-badge')),false);
 assert.equal(a.dom.window.document.querySelector('.move-feedback-square'),null);
});

test('downgrading special feedback removes the animated flash without starting an ordinary badge effect',t=>{
 const a=board(t,'1. e4 e5');a.state.classif[1]='great';a.call('go',1);assert.ok(a.dom.window.document.querySelector('.move-feedback-square'));
 a.state.classif[1]='best';a.call('paintBoard');assert.equal(a.dom.window.document.querySelector('.move-feedback-square'),null);
 assert.equal(a.animations.filter(n=>n.node.classList.contains('sq-badge')).length,1);
});

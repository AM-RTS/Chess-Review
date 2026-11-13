import test from 'node:test';
import assert from 'node:assert/strict';
import {app,loadGame,branch,settle} from './helpers/app.mjs';

function board(t,pgn) {
 const a=app(t);loadGame(a,pgn);a.call('computeDerived');a.call('buildUI');a.call('renderAll');
 a.state.settings.moveAnim=true;
 a.replace('navAnimationDuration',()=>180);a.replace('requestLiveEval',()=>{});
 const animations=[];
 a.dom.window.Element.prototype.animate=function(frames,options){
  let finish;const animation={node:this,frames,options,effect:{getKeyframes:()=>frames},cancelled:false,finished:new Promise(r=>finish=r),cancel(){this.cancelled=true;finish();},finish};
  animations.push(animation);return animation;
 };
 a.dom.window.Element.prototype.getAnimations=function(){return animations.filter(a=>a.node===this&&!a.cancelled);};
 for(const [name,square]of Object.entries(a.run('sqByName')))square.getBoundingClientRect=()=>({left:(name.charCodeAt(0)-97)*100,top:(8-Number(name[1]))*100,width:100,height:100});
 const nativeRect=a.dom.window.HTMLElement.prototype.getBoundingClientRect;
 a.dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.matches('.piece, .piece-svg, .piece-img'))return this.parentElement.getBoundingClientRect();
  if(!this.classList.contains('sq-badge'))return nativeRect.call(this);
  const r=this.parentElement.getBoundingClientRect(),size=42*(a.state.settings.badgeScale??1);
  return {left:r.left+(this.parentElement.classList.contains('right-col')?79:93)-size/2,
    top:r.top+(this.parentElement.classList.contains('top-row')?22:7)-size/2,width:size,height:size};
 };
 return {...a,animations};
}
const slides=a=>a.animations.filter(n=>n.frames[0].transform?.startsWith('translate(')&&n.frames.at(-1).transform==='translate(0, 0)');

for(const loser of ['w','b'])test('timeout marks the recorded loser, not the side to move: '+loser,t=>{
 const a=board(t,'1. e4 e5');a.state.headers={Result:loser==='w'?'0-1':'1-0',Termination:'won on time'};
 a.call('go',2);const doc=a.dom.window.document;
 assert.equal(doc.querySelector('.mate-marker.mate-loser').getAttribute('aria-label'),'Timeout');
 assert.ok(doc.querySelector('.mate-loser .mate-symbol circle'));assert.ok(doc.querySelector('.mate-winner'));
 assert.equal(a.run('sqByName')[loser==='w'?'e1':'e8'].querySelector('.mate-loser')!=null,true);
 a.call('go',1);assert.equal(doc.querySelector('.mate-marker'),null);
});
test('API timeout metadata works without termination text; resignation is not a timeout',t=>{
 const a=board(t,'1. e4 e5');a.state.headers={Result:'1-0'};a.state.meta={black:{result:'timeout'}};
 a.call('go',2);assert.ok(a.dom.window.document.querySelector('[aria-label="Timeout"]'));
 a.call('go',1);a.state.meta={};a.state.headers.Termination='White won by resignation';a.call('go',2);
 assert.equal(a.dom.window.document.querySelector('.mate-marker'),null);
});
test('draw gives both kings neutral markers with no winner and does not leak into variations',t=>{
 const a=board(t,'1. e4 e5');a.state.headers={Result:'1/2-1/2',Termination:'draw by agreement'};a.call('go',2);
 const doc=a.dom.window.document;assert.equal(doc.querySelectorAll('.mate-draw.mate-marker').length,2);
 assert.equal(doc.querySelector('.mate-winner'),null);
 const count=a.animations.filter(n=>n.node.classList.contains('mate-marker')).length;a.call('paintBoard');
 assert.equal(a.animations.filter(n=>n.node.classList.contains('mate-marker')).length,count);
 branch(a);a.call('paintBoard');assert.equal(doc.querySelector('.mate-marker'),null);
 a.state.analysisMode=false;a.state.variation=null;
 a.call('go',1);assert.equal(doc.querySelector('.mate-marker'),null);
 branch(a);a.call('paintBoard');assert.equal(doc.querySelector('.mate-marker'),null);
});

test('special effects can be disabled and their speed scales every layer',t=>{
 const a=board(t,'1. e4 e5');a.state.classif[1]='great';
 assert.equal(a.state.settings.specialMoveAnim,true);
 a.state.settings.specialMoveAnim=false;a.call('go',1);
 assert.ok(a.dom.window.document.querySelector('.sq-badge'));assert.equal(a.dom.window.document.querySelector('.move-feedback-square'),null);
 a.call('go',0);a.state.settings.specialMoveAnim=true;a.state.settings.specialMoveSpeed=2;a.call('go',1);
 assert.ok(a.animations.some(n=>n.node.classList.contains('sq-badge')&&n.options.duration===650));
 assert.equal(a.animations.find(n=>n.node.classList.contains('move-feedback-square')).options.duration,650);
});
test('special effect preferences persist through the normal settings path',async t=>{
 const a=board(t,'1. e4');
 await a.call('setSetting','specialMoveAnim',false);await a.call('setSetting','specialMoveSpeed',1.5);
 assert.equal(a.store.settings.specialMoveAnim,false);assert.equal(a.store.settings.specialMoveSpeed,1.5);
});
test('checkmate retains static symbols with motion disabled',t=>{
 const a=board(t,'1. f3 e5 2. g4 Qh4#');a.state.settings.moveAnim=false;a.call('go',4);
 assert.equal(a.dom.window.document.querySelectorAll('.mate-marker').length,2);
 assert.equal(a.animations.length,0);
});

test('backward navigation replays special feedback and is not suppressed by fast scrubbing',t=>{
 const a=board(t,'1. e4 e5');a.state.classif[1]='brilliant';a.call('go',2);
 a.replace('navAnimationDuration',()=>30);a.call('go',1);
 assert.equal(slides(a).at(-1).node.dataset.piece,'bP');
 assert.ok(a.animations.some(n=>n.node.classList.contains('sq-badge')));
});

test('backing out of the first review variation animates before returning to the game',t=>{
 const a=board(t,'1. e4 e5');branch(a,0,1);a.call('paintBoard');a.replace('navAnimationDuration',()=>30);
 a.call('navPrev');assert.equal(a.state.analysisMode,false);
 assert.equal(slides(a).at(-1).node.dataset.piece,'wP');
});

test('holding navigation at either boundary stays silent and does not restart live analysis', t => {
 const a=board(t,'1. e4 d5 2. exd5'),sounds=[];let searches=0;
 a.replace('playSanSound',san=>sounds.push(san));a.replace('requestLiveEval',()=>searches++);
 a.state.standalone=true;branch(a,0,1);
 a.call('navPrev');assert.deepEqual(sounds,['e4']);assert.equal(searches,1);
 for(let i=0;i<20;i++)a.call('navPrev');
 assert.deepEqual(sounds,['e4']);assert.equal(searches,1);
 a.call('gotoVar',3);sounds.length=0;searches=0;
 for(let i=0;i<20;i++)a.call('navNext');
 a.call('gotoVar',3);assert.deepEqual(sounds,[]);assert.equal(searches,0);
 a.call('navPrev');assert.deepEqual(sounds,['exd5']);
});

test('mainline navigation remains silent past the first and last positions', t => {
 const a=board(t,'1. e4 e5'),sounds=[];
 a.replace('playMoveSound',ply=>sounds.push(ply));a.call('go',1);
 sounds.length=0;a.call('navPrev');
 for(let i=0;i<20;i++)a.call('navPrev');
 assert.deepEqual(sounds,[1]);a.call('go',2);sounds.length=0;
 for(let i=0;i<20;i++)a.call('navNext');
 assert.deepEqual(sounds,[]);
});

for(const pgn of ['1. f3 e5 2. g4 Qh4#','1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#'])test('checkmate marks both kings once and clears on undo: '+pgn,t=>{
 const a=board(t,pgn);a.call('go',a.state.total);
 const doc=a.dom.window.document,markers=[...doc.querySelectorAll('.mate-marker')];assert.equal(markers.length,2);
 assert.ok(doc.querySelector('.mate-loser .mate-king'));assert.ok(doc.querySelector('.mate-winner svg'));
 const count=a.animations.filter(n=>n.node.classList.contains('mate-marker')).length;
 a.call('paintBoard');assert.ok(doc.querySelector('.mate-loser .mate-king'));
 assert.equal(a.animations.filter(n=>n.node.classList.contains('mate-marker')).length,count);
 a.call('go',a.state.total-1);assert.equal(doc.querySelectorAll('.mate-marker').length,0);
});

test('forward and reverse navigation use reference timing and easing',t=>{
 const a=board(t,'1. e4 e5');a.call('go',1);
 assert.equal(slides(a).length,1);assert.equal(slides(a)[0].options.duration,180);assert.equal(slides(a)[0].options.easing,'ease-in-out');
 assert.equal(slides(a)[0].frames[0].transform,'translate(0px, 200px)');
 a.call('go',0);assert.equal(slides(a).at(-1).frames[0].transform,'translate(0px, -200px)');
 assert.equal(slides(a)[0].cancelled,true);
});

test('held navigation animates both directions at the repeat cadence', t => {
 const a=board(t,'1. e4 e5 2. Nf3');a.replace('navAnimationDuration',()=>35);
 for(const ply of [1,2,3,2,1,0])a.call('go',ply);
 assert.equal(slides(a).length,6);
 assert.ok(slides(a).every(animation=>animation.options.duration===35));
});

test('another piece can move without cancelling an unfinished slide', t => {
 const a=board(t,'1. e4 e5');a.call('go',1);
 const first=slides(a)[0];a.call('go',2);
 assert.equal(first.cancelled,false);
 assert.ok(first.node.isConnected);
 assert.equal(slides(a).length,2);
});

test('navigation clears old special dimming while preserving the piece slide', t => {
 const a=board(t,'1. e4 e5');a.state.classif[1]='great';a.call('go',1);
 const first=slides(a)[0],dimming=a.animations.filter(animation=>animation.node===first.node&&animation.frames[1].opacity===.2);
 assert.ok(dimming.length);a.call('go',2);
 assert.equal(first.cancelled,false);assert.ok(dimming.every(animation=>animation.cancelled));
});

test('reversing an unfinished slide starts at its visible position', t => {
 const a=board(t,'1. e4');a.call('go',1);
 const first=slides(a)[0];
 first.node.getBoundingClientRect=()=>({left:400,top:500,width:100,height:100});
 a.call('go',0);
 assert.equal(first.cancelled,true);
 assert.equal(slides(a).at(-1).frames[0].transform,'translate(0px, -100px)');
});

test('navigation duration follows repeat intervals and respects configured speed', t => {
 const a=app(t);let now=1000;a.context.performance={now:()=>now};
 assert.equal(a.call('navAnimationDuration'),180);
 now+=35;assert.equal(a.call('navAnimationDuration'),35);
 now+=5;assert.equal(a.call('navAnimationDuration'),30);
 now+=1000;assert.equal(a.call('navAnimationDuration'),180);
 a.state.settings.animSpeed=10;now+=1000;assert.equal(a.call('navAnimationDuration'),60);
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


for(const category of ['great','brilliant'])test(category+' shows the white glyph before revealing its corner circle',async t=>{
 const a=board(t,'1. e4 e5');a.state.classif[1]=category;a.call('go',1);
 const glyph=a.dom.window.document.querySelector('.move-feedback-glyph');assert.ok(glyph);
 assert.match(glyph.getAttribute('href'),new RegExp((category==='great'?'great_find':'brilliant')+'-glyph.svg$'));
 const artwork=glyph.previousElementSibling, reveal=a.animations.find(n=>n.node===artwork);
 assert.equal(reveal.frames[0].opacity,0);assert.equal(reveal.frames[1].offset,10/13);assert.equal(reveal.frames[2].opacity,1);
 const piece=a.run('sqByName').e4.querySelector('.piece-img');
 assert.ok(a.animations.some(n=>n.node===piece&&n.frames[1].opacity===.2));
 a.state.classif[1]='best';a.call('paintBoard');
 assert.equal(a.dom.window.document.querySelector('.move-feedback-glyph'),null);
 assert.ok(a.animations.filter(n=>n.node===piece&&n.frames[1].opacity===.2).every(n=>n.cancelled));
});


test('score-only pack updates preserve the glyph and its running animation',t=>{
 const a=board(t,'1. e4 e5');a.state.classif[1]='great';a.state.moveGrades[1]=9.5;a.call('go',1);
 const glyph=a.dom.window.document.querySelector('.move-feedback-glyph'),artwork=glyph.previousElementSibling;
 a.state.moveGrades[1]=9.8;a.call('paintBoard');
 assert.equal(a.dom.window.document.querySelector('.move-feedback-glyph'),glyph);
 assert.equal(glyph.previousElementSibling,artwork);assert.match(glyph.parentElement.parentElement.getAttribute('aria-label'),/9.8/);
});

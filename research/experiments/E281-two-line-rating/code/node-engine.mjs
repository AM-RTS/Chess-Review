import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {Engine} from '../../../../engine/uci.js';

// Use the production parser/queue with upstream's Node CLI instead of a browser Worker.
export async function connect(build) {
  const file=build==='sf19'?'engine/stockfish-19-single.js':'engine/stockfish-19-lite-single.js';
  const previous=globalThis.Worker;
  globalThis.Worker=class {
    constructor(){
      this.child=spawn(process.execPath,['tools/calibration/engine-host.cjs',path.resolve(file)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      createInterface({input:this.child.stdout}).on('line',data=>this.onmessage?.({data}));
      this.child.stderr.on('data',data=>{this.stderr=(this.stderr||'').slice(-1000)+data;});
      this.child.stdin.on('error',e=>{if(!this.closed)this.onerror?.({message:e.message});});
      this.child.on('error',e=>this.onerror?.({message:e.message}));
      this.child.on('exit',code=>{if(!this.closed)this.onerror?.({message:`Engine exited ${code}: ${this.stderr||''}`});});
    }
    postMessage(command){this.child.stdin.write(command+'\n');}
    terminate(){this.closed=true;this.child.kill();}
  };
  let engine;
  try{engine=new Engine(file);}finally{globalThis.Worker=previous;}
  try{
    await engine._ready;
    if(!/^Stockfish 19\b/.test(engine.identity)||(/Lite/i.test(engine.identity)!==(build==='sf19lite')))throw Error('Wrong engine identity');
    await engine.setOptions({Hash:build==='sf19'?16:32,'Skill Level':20,UCI_ShowWDL:true,UCI_LimitStrength:false,UCI_Chess960:false});
    engine.buildKey=build;return engine;
  }catch(error){engine.terminate();throw error;}
}

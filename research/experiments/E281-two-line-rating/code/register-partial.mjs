import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {sha256} from '../../../data-policy.mjs';
const prefix='research/experiments/E281-two-line-rating/evidence/sf19-partial',run='research/runs/E281/sf19-full';
await mkdir(prefix,{recursive:true});
const file='research/datasets/D002-fresh-prefix/manifest.json',manifest=JSON.parse(await readFile(file,'utf8'));
const header=JSON.parse(await readFile(run+'/header.json','utf8')),progress=JSON.parse(await readFile(run+'/progress.json','utf8')),files=[];
for(const name of (await readdir(run)).filter(n=>/^game-\d+\.json\.gz$/.test(n)).sort()){
 const target=prefix+'/'+name;await copyFile(run+'/'+name,target);const bytes=await readFile(target);
 manifest.artifacts[target]={kind:'summary',parents:['research/datasets/D002-fresh-prefix/games.json.gz'],sha256:sha256(bytes),bytes:bytes.length,uncompressedSha256:sha256(gunzipSync(bytes))};files.push(target);
}
const target=prefix+'/resume.json',bytes=Buffer.from(JSON.stringify({header,priorElapsedMs:progress.elapsedSeconds*1000,files},null,2)+'\n');
await writeFile(target,bytes);manifest.artifacts[target]={kind:'summary',parents:files,sha256:sha256(bytes),bytes:bytes.length,uncompressedSha256:sha256(bytes)};
await writeFile(file,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({registeredPartialGames:files.length,sourceSelection:header.selectionHash}));

import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {sha256} from '../../../data-policy.mjs';

const [build,kind='observations']=process.argv.slice(2);
if(!['sf19','sf19lite'].includes(build)||!['observations','model','adjacent-observations','adjacent-model'].includes(kind))throw Error('Expected build and evidence kind');
const observation=kind.endsWith('observations'),suffix=kind.startsWith('adjacent-')?'-adjacent':'',base='research/experiments/E281-two-line-rating/evidence/';
const name=`${base}${build}${suffix}-${observation?'observations.json.gz':'model.json'}`;
const bytes=await readFile(name),decoded=observation?gunzipSync(bytes):bytes;
const file='research/datasets/D002-fresh-prefix/manifest.json',manifest=JSON.parse(await readFile(file,'utf8'));
const parents=observation?['research/datasets/D002-fresh-prefix/games.json.gz']:[`${base}${build}${suffix}-observations.json.gz`];
if(observation&&suffix)parents.push(build==='sf19lite'?base+'sf19lite-observations.json.gz':base+'sf19-partial/resume.json');
const entry={kind:'summary',parents,sha256:sha256(bytes),bytes:bytes.length,uncompressedSha256:sha256(decoded)};
if(manifest.artifacts[name]&&JSON.stringify(manifest.artifacts[name])!==JSON.stringify(entry))throw Error('Refusing to replace registered evidence');
manifest.artifacts[name]=entry;await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({registered:name,bytes:bytes.length,sha256:entry.sha256}));

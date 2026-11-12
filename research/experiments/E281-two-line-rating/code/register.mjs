import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {sha256} from '../../../data-policy.mjs';

const [build,kind='observations']=process.argv.slice(2);
if(!['sf19','sf19lite'].includes(build)||!['observations','model'].includes(kind))throw Error('Expected build and observations|model');
const name=`research/experiments/E281-two-line-rating/evidence/${build}-${kind==='observations'?'observations.json.gz':'model.json'}`;
const bytes=await readFile(name),decoded=kind==='observations'?gunzipSync(bytes):bytes;
const file='research/datasets/D002-fresh-prefix/manifest.json',manifest=JSON.parse(await readFile(file,'utf8'));
const entry={kind:'summary',parents:[kind==='observations'?'research/datasets/D002-fresh-prefix/games.json.gz':`research/experiments/E281-two-line-rating/evidence/${build}-observations.json.gz`],sha256:sha256(bytes),bytes:bytes.length,uncompressedSha256:sha256(decoded)};
if(manifest.artifacts[name]&&JSON.stringify(manifest.artifacts[name])!==JSON.stringify(entry))throw Error('Refusing to replace registered evidence');
manifest.artifacts[name]=entry;await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({registered:name,bytes:bytes.length,sha256:entry.sha256}));

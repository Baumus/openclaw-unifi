// Repeated cold-process module loads; no Gateway calls, config writes or network.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]??'.');
const result={samples:5,modules:{}};
for(const name of ['setup','index']){
 const url=pathToFileURL(resolve(root,'dist/'+name+'.js')).href;
 const timings=[];
 for(let i=0;i<result.samples;i++)timings.push(Number(execFileSync(process.execPath,['--input-type=module','-e',`const t=performance.now(); await import(${JSON.stringify(url)}); console.log(performance.now()-t);`],{encoding:'utf8'}).trim()));
 result.modules[name]={medianMs:Math.round([...timings].sort((a,b)=>a-b)[Math.floor(timings.length/2)]),samplesMs:timings.map(x=>Math.round(x))};
}
console.log(JSON.stringify(result,null,2));

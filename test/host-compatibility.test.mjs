// Version-matched host internals are read-only test fixtures, not runtime imports.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';

const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const dist=fileURLToPath(new URL('../',import.meta.resolve('openclaw/plugin-sdk/plugin-entry')));
const host=JSON.parse(readFileSync(join(dist,'..','package.json'),'utf8'));
assert.equal(host.version,'2026.11.1','Run compatibility tests with the exact supported host SDK');
const fixture=readdirSync(dist).filter(f=>f.startsWith('package-compat-')&&f.endsWith('.mjs')).find(f=>/\bsatisfiesPluginApiRange as ([\w$]+)/.test(readFileSync(join(dist,f),'utf8')));
assert.ok(fixture,'Missing version-matched host compatibility test fixture');
const alias=readFileSync(join(dist,fixture),'utf8').match(/\bsatisfiesPluginApiRange as ([\w$]+)/)[1];
const satisfiesPluginApiRange=(await import(pathToFileURL(join(dist,fixture)).href))[alias];

for(const [field,range] of [
 ['pluginApi',pkg.openclaw.compat.pluginApi],
 ['minGatewayVersion',pkg.openclaw.compat.minGatewayVersion],
 ['peerDependencies.openclaw',pkg.peerDependencies.openclaw],
]){
 for(const [version,expected] of [['2026.11.1',true],['2026.10.10',false],['2026.11.2',false]]){
  test(`${field} accepts only the supported host: ${version}`,()=>{
   assert.equal(range,'2026.11.1');
   assert.equal(satisfiesPluginApiRange(version,range),expected);
  });
 }
}
test('host compatibility rejects npm-style OR syntax',()=>{
 assert.equal(satisfiesPluginApiRange('2026.11.1','>=2026.10.7 <2026.11.0 || 2026.11.1'),false);
});

// Version-matched, isolated-process integration check. Host internals are read-only
// test fixtures, never runtime imports or modifications to the Gateway process.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import entry from '../dist/index.js';
const dist=fileURLToPath(new URL('../',import.meta.resolve('openclaw/plugin-sdk/plugin-entry')));
async function internal(prefix,name){
 const file=readdirSync(dist).filter(f=>f.startsWith(prefix)&&f.endsWith('.mjs')).find(f=>new RegExp('\\b'+name+' as ([\\w$]+)').test(readFileSync(join(dist,f),'utf8')));
 assert.ok(file,'Missing version-matched host test fixture '+name);
 const alias=readFileSync(join(dist,file),'utf8').match(new RegExp('\\b'+name+' as ([\\w$]+)'))[1];
 return (await import(pathToFileURL(join(dist,file)).href))[alias];
}
const setRegistry=await internal('runtime-','setActivePluginRegistry');
const empty=await internal('registry-empty-','createEmptyPluginRegistry');
const plan=await internal('config-reload-plan-','buildGatewayReloadPlan');
const registry=empty();setRegistry(registry,'unifi-test-before');
const paths=['plugins.entries.unifi.config.apiKey','plugins.entries.unifi.config.setupBinding'];
assert.equal(plan(paths).reloadPlugins,true,'Before: token changes trigger plugin replacement');
let policy;entry.register({registerReload:r=>policy=r,registerGatewayMethod(){},registerTool(){}});
const configured=empty();configured.reloads.push({pluginId:'unifi',registration:policy});setRegistry(configured,'unifi-test-after');
for(const path of [...paths,'plugins.entries.unifi.config','plugins.entries.unifi.config.requestTimeoutMs','plugins.entries.unifi.config.maxResponseBytes']){
 const result=plan([path]);assert.equal(result.reloadPlugins,false,path);assert.equal(result.restartGateway,false,path);assert.deepEqual(result.noopPaths,[path]);
}
for(const path of ['plugins.entries.unifi.enabled','plugins.installs.unifi.version','plugins.entries.other.config.apiKey'])assert.equal(plan([path]).reloadPlugins,true,path);
assert.equal(plan(paths,{pluginLifecycle:{}}).reloadPlugins,true,'Explicit plugin lifecycle replacement is not bypassed');
console.log('Host reload planner: token/config changes no longer drain or replace UniFi; enablement/code/other plugin changes and explicit lifecycle operations still reload. No running Gateway touched.');

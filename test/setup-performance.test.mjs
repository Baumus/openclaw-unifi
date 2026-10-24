import test from 'node:test';
import assert from 'node:assert/strict';
import { Onboarding } from '../dist/onboarding.js';
import { checkConnection, registerSetup } from '../dist/setup.js';
import entry from '../dist/index.js';
const key = 'synthetic-performance-token';
const ref = {source:'store',provider:'default',id:'OPENCLAW_UNIFI_'+'F'.repeat(32)};
const active = () => ({plugins:{entries:{unifi:{config:{apiKey:key,setupBinding:ref.id}}}}});
const source = () => ({plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref.id}}}}});
const good = {configured:true,connected:true,sites:1};
function methods(runtime) {
 const handlers=new Map();
 registerSetup({registerGatewayMethod:(n,h)=>handlers.set(n,h),runtime:{config:{current:runtime}}},source);
 return async (params={})=>{let reply;await handlers.get('unifi.connection.check')({params,respond:(ok,data)=>reply={ok,data}});return reply;};
}
test('entry registers no-replacement policy only for live plugin config, not code or enablement',()=>{
 let reload;entry.register({registerReload:r=>reload=r,registerGatewayMethod(){},registerTool(){}});
 assert.deepEqual(reload,{noopPrefixes:['plugins.entries.unifi.config']});
});
test('redacted config readback cannot break one-click setup; five RPCs and full expected-ref proof',async()=>{
 const calls=[];let bound;const stages=[];
 const host={request:async(method,p)=>{calls.push(method);
  if(method==='config.get')return {hash:'fresh',valid:true,config:{plugins:{entries:{unifi:{config:{apiKey:bound?{...bound,id:'__OPENCLAW_REDACTED__'}:undefined,setupBinding:bound?.id}}}}}};
  if(method==='config.patch'){bound=JSON.parse(p.raw).plugins.entries.unifi.config.apiKey;return {ok:true};}
  if(method==='unifi.connection.check'){assert.deepEqual(p.expectedRef,bound);return good;}
  return {ok:true};
 }};
 const flow=new Onboarding(host,new AbortController().signal,undefined,undefined,s=>stages.push(s));
 assert.deepEqual(await flow.connect(key,true),good);
 assert.deepEqual(calls,['config.get','secrets.store.set','config.get','config.patch','unifi.connection.check']);
 assert.deepEqual(stages,['configuration','storage','activation','connection']);
 assert.equal(flow.canRetry,false);
});
test('resume with visible generation and redacted ref reconciles without rewriting config or token',async()=>{
 const saved=JSON.stringify({ref,createdAt:Date.now()});const calls=[];
 const flow=new Onboarding({request:async(method,p)=>{calls.push(method);
  if(method==='config.get')return {hash:'fresh',config:{plugins:{entries:{unifi:{config:{apiKey:{...ref,id:'__OPENCLAW_REDACTED__'},setupBinding:ref.id}}}}}};
  if(method==='secrets.store.list')return {entries:[{name:ref.id,kind:'secret'}]};
  if(method==='unifi.connection.status')return {sourceMatches:true};
  if(method==='unifi.connection.check'){assert.deepEqual(p.expectedRef,ref);return good;}
  throw Error('Unexpected write '+method);
 }},new AbortController().signal,{getItem:()=>saved,setItem(){},removeItem(){}});
 assert.deepEqual(await flow.connect('',true),good);
 assert.deepEqual(calls,['config.get','secrets.store.list','config.get','unifi.connection.status','unifi.connection.check']);
});
test('nonsecret marker alone never proves readiness or clears pending recovery',async()=>{
 const saved=JSON.stringify({ref,createdAt:Date.now()});
 const flow=new Onboarding({request:async(method)=>{
  if(method==='config.get')return {hash:'fresh',config:{plugins:{entries:{unifi:{config:{setupBinding:ref.id}}}}}};
  if(method==='secrets.store.list')return {entries:[{name:ref.id,kind:'secret'}]};
  if(method==='unifi.connection.status')return {sourceMatches:true};
  if(method==='unifi.connection.check')return {configured:true,connected:false,code:'configuration_not_active'};
  throw Error('Unexpected write');
 }},new AbortController().signal,{getItem:()=>saved,setItem(){},removeItem(){}});
 assert.equal((await flow.connect('',true)).connected,false);assert.equal(flow.canRetry,true);
});
test('setup GET requests only one site and caps deadline without modifying agent settings',async t=>{
 const timeout=AbortSignal.timeout.bind(AbortSignal);const deadlines=[];
 t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return timeout(ms);});
 const config={apiKey:key,requestTimeoutMs:120000};
 assert.deepEqual(await checkConnection(config,{fetch:async(url,init)=>{assert.equal(url.pathname,'/v1/sites');assert.equal(url.searchParams.get('pageSize'),'1');assert.equal(init.method,'GET');return new Response('{"data":[{}]}');}}),good);
 assert.deepEqual(deadlines,[8000]);assert.equal(config.requestTimeoutMs,120000);
});
test('setup preserves shorter configured deadline even if fetch ignores cancellation',async()=>{
 const start=performance.now();const result=await checkConnection({apiKey:key,requestTimeoutMs:100},{fetch:()=>new Promise(()=>{})});
 assert.equal(result.code,'timeout');assert.ok(performance.now()-start<1500);
});
test('concurrent checks share one GET but later checks are never cached',async()=>{
 const cfg=active();const call=methods(()=>cfg);let sends=0,release;
 const original=globalThis.fetch;globalThis.fetch=async()=>{sends++;await new Promise(r=>release=r);return new Response('{"data":[{}]}');};
 try{
  const a=call({expectedRef:ref}),b=call({expectedRef:ref});await new Promise(r=>setImmediate(r));assert.equal(sends,1);release();
  assert.deepEqual((await a).data,good);assert.deepEqual((await b).data,good);
  const c=call({expectedRef:ref});await new Promise(r=>setImmediate(r));assert.equal(sends,2);release();assert.deepEqual((await c).data,good);
 }finally{globalThis.fetch=original;}
});
test('rotation invalidates an unbound in-flight check and new runtime does not share old GET',async()=>{
 let cfg=active();const call=methods(()=>cfg);let sends=0;const releases=[];
 const original=globalThis.fetch;globalThis.fetch=async()=>{sends++;await new Promise(r=>releases.push(r));return new Response('{"data":[{}]}');};
 try{
  const a=call();await new Promise(r=>setImmediate(r));cfg=active();const b=call();await new Promise(r=>setImmediate(r));assert.equal(sends,2);releases.forEach(r=>r());
  assert.equal((await a).data.code,'configuration_not_active');assert.deepEqual((await b).data,good);
 }finally{globalThis.fetch=original;}
});
test('wrong expected source cannot piggyback on a valid in-flight probe',async()=>{
 const cfg=active();const call=methods(()=>cfg);let sends=0,release;
 const original=globalThis.fetch;globalThis.fetch=async()=>{sends++;await new Promise(r=>release=r);return new Response('{"data":[{}]}');};
 try{
  const a=call({expectedRef:ref});const bad=await call({expectedRef:{...ref,id:'OPENCLAW_UNIFI_'+'A'.repeat(32)}});
  assert.equal(bad.data.code,'configuration_not_active');assert.equal(sends,1);release();assert.deepEqual((await a).data,good);
 }finally{globalThis.fetch=original;}
});
test('lazy registered factories preserve live runtime reads and release version identity',async()=>{
 const factories=new Map();entry.register({pluginConfig:{},registerReload(){},registerGatewayMethod(){},registerTool:(f,o)=>factories.set(o.name,f)});
 let current={};const tool=factories.get('unifi_status')({getRuntimeConfig:()=>current});
 assert.equal((await tool.execute('before',{})).details.configured,false);
 current=active();const status=(await tool.execute('after',{})).details;
 assert.equal(status.configured,true);assert.equal(status.version,'0.2.1');
});
test('resume repairs mismatched hidden source ref despite matching visible marker',async()=>{
 const saved=JSON.stringify({ref,createdAt:Date.now()});let patches=0,checks=0;
 const flow=new Onboarding({request:async(method,p)=>{
  if(method==='config.get')return {hash:'fresh',config:{plugins:{entries:{unifi:{config:{apiKey:{...ref,id:'__OPENCLAW_REDACTED__'},setupBinding:ref.id}}}}}};
  if(method==='secrets.store.list')return {entries:[{name:ref.id,kind:'secret'}]};
  if(method==='unifi.connection.status')return {sourceMatches:false};
  if(method==='config.patch'){patches++;assert.deepEqual(JSON.parse(p.raw).plugins.entries.unifi.config.apiKey,ref);return {ok:true};}
  if(method==='unifi.connection.check'){checks++;return good;}
  throw Error('Unexpected request');
 }},new AbortController().signal,{getItem:()=>saved,setItem(){},removeItem(){}});
 assert.deepEqual(await flow.connect('',true),good);assert.equal(patches,1);assert.equal(checks,1);
});
test('local source-binding status checks exact reference and marker without a GET',async()=>{
 const handlers=new Map();const cfg=active();let sent=0;const original=globalThis.fetch;globalThis.fetch=async()=>{sent++;throw Error('No GET allowed');};
 try{
  registerSetup({registerGatewayMethod:(n,h)=>handlers.set(n,h),runtime:{config:{current:()=>cfg}}},source);
  for(const match of [true,false]){
   let reply;await handlers.get('unifi.connection.status')({params:{expectedRef:match?ref:{...ref,provider:'other'}},respond:(_ok,data)=>reply=data});
   assert.equal(reply.sourceMatches,match);assert.equal(reply.connected,false);assert.equal(reply.version,'0.2.1');
  }
  assert.equal(sent,0);
 }finally{globalThis.fetch=original;}
});
test('prepared capability input is invocation-only, revision guarded and never rewrites source',async()=>{
 const {captureCredential}=await import('../dist/credential.js');
 const config={apiKey:ref,setupBinding:ref.id};let prepared={value:key,revision:4};let reads=0;
 const credential=await captureCredential(config,(id,path)=>{reads++;assert.equal(id,'unifi');assert.equal(path,'apiKey');return prepared;});
 assert.equal(credential.config.apiKey,key);assert.deepEqual(config.apiKey,ref);assert.equal(credential.isCurrent(),true);
 prepared={value:'different-synthetic-token',revision:5};assert.equal(credential.isCurrent(),false);assert.equal(reads,3);
 const unavailable=await captureCredential(config,()=>({revision:6}));assert.equal(unavailable.config.apiKey,undefined);
 const removed=await captureCredential({},()=>{throw Error('Removed credential must not query a fallback');});assert.equal(removed.config.apiKey,undefined);
});
test('setup supports prepared capability refs and rejects rotation or stale resolved marker',async()=>{
 for(const drift of [false,true]){
  const handlers=new Map();const cfg={plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref.id}}}}};let revision=1,sends=0;
  registerSetup({registerGatewayMethod:(n,h)=>handlers.set(n,h),runtime:{config:{current:()=>cfg}}},source,()=>({value:key,revision}));
  const original=globalThis.fetch;globalThis.fetch=async(_url,init)=>{sends++;assert.equal(init.headers['X-API-KEY'],key);if(drift)revision++;return new Response('{"data":[{}]}');};
  try{
   let reply;await handlers.get('unifi.connection.check')({params:{expectedRef:ref},respond:(_ok,data)=>reply=data});
   assert.equal(reply.connected,!drift);if(drift)assert.equal(reply.code,'configuration_not_active');assert.equal(sends,1);
   cfg.plugins.entries.unifi.config.setupBinding='OPENCLAW_UNIFI_'+'B'.repeat(32);
   await handlers.get('unifi.connection.check')({params:{expectedRef:ref},respond:(_ok,data)=>reply=data});
   assert.equal(reply.code,'configuration_not_active');assert.equal(sends,1);
  }finally{globalThis.fetch=original;}
 }
});

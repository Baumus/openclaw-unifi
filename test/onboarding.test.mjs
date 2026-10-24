import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Onboarding, SetupFailure } from '../dist/onboarding.js';
import { checkConnection, registerSetup } from '../dist/setup.js';
import { mountSetup } from '../dist/control-ui.js';
const key = 'synthetic-ui-token-not-a-real-credential';
const good = {configured:true,connected:true,sites:2};
function harness(overrides={}) {
 const calls=[];const controller=new AbortController();let revision=0;let savedRef;const entries=[];
 const host={request:async(method,params)=>{calls.push({method,params}); if(overrides[method])return overrides[method](params);
 if(method==='config.get')return {hash:'rev'+(++revision),valid:true,config:{secrets:{defaults:{store:'team-store'}},plugins:{entries:{unifi:{config:{requestTimeoutMs:1234,...(savedRef?{apiKey:savedRef,setupBinding:savedRef.id}:{})}}}}}};
 if(method==='secrets.store.list')return {entries};
 if(method==='secrets.store.set')entries.push({name:params.name,kind:'secret'});
 if(method==='config.patch')savedRef=JSON.parse(params.raw).plugins.entries.unifi.config.apiKey;
 if(method==='unifi.connection.check'){
   const source=overrides['config.get']?await overrides['config.get']({}):{config:{plugins:{entries:{unifi:{config:{setupBinding:savedRef?.id}}}}}};
   return source.config?.plugins?.entries?.unifi?.config?.setupBinding===params.expectedRef?.id?good:{configured:false,connected:false,code:'configuration_not_active'};
 }
 return {ok:true};}};
 return {calls,host,controller,flow:new Onboarding(host,controller.signal)};
}
test('one-click setup stores only through protected host RPC and binds effective provider with fresh revision',async()=>{
 const h=harness();assert.deepEqual(await h.flow.connect(key,true),good);
 assert.deepEqual(h.calls.map(c=>c.method),['config.get','secrets.store.set','config.get','config.patch','unifi.connection.check']);
 const store=h.calls[1].params;assert.equal(store.kind,'secret');assert.equal(store.value,key);assert.match(store.name,/^OPENCLAW_UNIFI_[A-F0-9]{32}$/);
 const patch=h.calls[3].params;assert.equal(patch.baseHash,'rev2');const raw=JSON.parse(patch.raw);
 assert.deepEqual(raw,{plugins:{entries:{unifi:{config:{apiKey:{source:'store',provider:'team-store',id:store.name},setupBinding:store.name}}}}});
 assert.ok(!JSON.stringify(h.calls.filter(c=>c.method!=='secrets.store.set')).includes(key));assert.equal(h.flow.canRetry,false);
});
test('default alias, empty list, and denied key remain distinct from authenticated success',async()=>{
 let ref;const h=harness({'config.get':()=>({hash:'x',config:{plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref?.id}}}}}}),'config.patch':p=>{ref=JSON.parse(p.raw).plugins.entries.unifi.config.apiKey;return {ok:true};},'unifi.connection.check':()=>({configured:true,connected:false,status:403,code:'http_error'})});
 const r=await h.flow.connect(key,true);assert.equal(r.connected,false);assert.equal(JSON.parse(h.calls[3].params.raw).plugins.entries.unifi.config.apiKey.provider,'default');
 const zero=await checkConnection({apiKey:key},{fetch:async()=>new Response('{"data":[]}')});assert.deepEqual(zero,{configured:true,connected:true,sites:0});
});
test('invalid inputs and missing admin cannot write or access network',async()=>{
 for(const [input,admin,stage] of [['',true,'token'],['has space',true,'token'],['x'.repeat(4097),true,'token'],[key,false,'permission']]){
 const h=harness();await assert.rejects(h.flow.connect(input,admin),e=>e.stage===stage);assert.equal(h.calls.length,0);}
});
test('invalid config is caught before storing',async()=>{
 const h=harness({'config.get':()=>({valid:false})});await assert.rejects(h.flow.connect(key,true),e=>e.stage==='configuration');assert.equal(h.calls.length,1);
});
test('failure at each host stage is sanitized and never claims success',async()=>{
 for(const [method,stage] of [['secrets.store.set','storage'],['config.patch','activation'],['unifi.connection.check','connection']]){
 const h=harness({[method]:()=>{throw Error('failure '+key);}});if(method==='config.patch'){assert.equal((await h.flow.connect(key,true)).code,'configuration_not_active');}else await assert.rejects(h.flow.connect(key,true),e=>{assert.ok(e instanceof SetupFailure);assert.equal(e.stage,stage);assert.ok(!String(e).includes(key));return true;});}
});
test('retry after config failure uses saved reference without reentering or rewriting token',async()=>{
 let fail=true,ref;const h=harness({'config.get':()=>({hash:'x',config:{plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref?.id}}}}}}),'config.patch':p=>{if(fail)throw Error('conflict');ref=JSON.parse(p.raw).plugins.entries.unifi.config.apiKey;return {ok:true};}});
 assert.equal((await h.flow.connect(key,true)).code,'configuration_not_active');assert.equal(h.flow.canRetry,true);fail=false;
 assert.deepEqual(await h.flow.connect('',true),good);assert.equal(h.calls.filter(c=>c.method==='secrets.store.set').length,1);
});
test('abort after secret storage prevents config mutation; no automatic deletion of uncertain writes',async()=>{
 const h=harness({'secrets.store.set':()=>{h.controller.abort();return {ok:true};}});
 await assert.rejects(h.flow.connect(key,true));assert.deepEqual(h.calls.map(c=>c.method),['config.get','secrets.store.set']);
});
test('double submit admits one storage operation only',async()=>{
 let release;const wait=new Promise(r=>release=r);const h=harness({'secrets.store.set':()=>wait});
 const first=h.flow.connect(key,true);await new Promise(r=>setImmediate(r));await assert.rejects(h.flow.connect(key,true));release({ok:true});await first;
 assert.equal(h.calls.filter(c=>c.method==='secrets.store.set').length,1);
});
test('connection check is bounded GET on fixed UniFi origin and returns aggregate only',async()=>{
 let sent;const r=await checkConnection({apiKey:key},{fetch:async(url,init)=>{sent={url,init};return new Response(JSON.stringify({data:[{name:'private site',id:'private-id'}],nextToken:'private-cursor'}));}});
 assert.equal(sent.url.origin,'https://api.ui.com');assert.equal(sent.init.method,'GET');assert.equal(sent.init.headers['X-API-KEY'],key);assert.equal(sent.init.redirect,'error');
 assert.deepEqual(r,{configured:true,connected:true,sites:1});assert.ok(!JSON.stringify(r).includes('private'));
});
test('connection errors and invalid payloads do not disclose provider content or token',async()=>{
 assert.deepEqual(await checkConnection({}),{configured:false,connected:false,code:'credential_unavailable'});
 for(const status of [401,403,429,500]){
 const r=await checkConnection({apiKey:key},{fetch:async()=>new Response(key,{status})});assert.equal(r.connected,false);assert.equal(r.status,status);assert.ok(!JSON.stringify(r).includes(key));}
 assert.equal((await checkConnection({apiKey:key},{fetch:async()=>new Response('{}')})).code,'unexpected_response');
 const r=await checkConnection({apiKey:key},{fetch:async()=>{throw Error(key);}});assert.equal(r.code,'transport_error');assert.ok(!JSON.stringify(r).includes(key));
});
test('registered read-scoped methods use latest runtime and reject arbitrary params',async()=>{
 const methods=new Map();let current={};registerSetup({registerGatewayMethod:(name,handler,options)=>methods.set(name,{handler,options}),runtime:{config:{current:()=>current}}});
 for(const m of methods.values())assert.equal(m.options.scope,'operator.read');
 const call=async(name,params)=>{let result;await methods.get(name).handler({params,respond:(...args)=>result=args});return result;};
 assert.equal((await call('unifi.connection.status',{}))[1].configured,false);current={plugins:{entries:{unifi:{config:{apiKey:key}}}}};
 assert.equal((await call('unifi.connection.status',{}))[1].configured,true);assert.equal((await call('unifi.connection.check',{token:key}))[0],false);
});
test('actual DOM journey has one masked input, clear-on-submit, success, and no token echo',async()=>{
 const window=new Window();globalThis.document=window.document;globalThis.window=window;const h=harness();
 const host={...h.host,locale:'de-DE',connection:{canAdmin:true,canRead:true,connected:true},subscribe:()=>()=>{}};
 const root=document.createElement('div');document.body.append(root);const view=mountSetup(root,{host,signal:h.controller.signal,props:{},presented:true});
 await new Promise(r=>setImmediate(r));const field=root.querySelector('input');assert.equal(field.type,'password');assert.equal(root.querySelectorAll('input').length,1);field.value=key;
 root.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(field.value,'');
 await new Promise(r=>setImmediate(r));assert.match(root.querySelector('[role=status]').textContent,/Verbunden/);assert.equal(root.textContent.includes(key),false);assert.equal(root.innerHTML.includes(key),false);
 view.dispose();assert.equal(root.childNodes.length,0);await window.happyDOM.close();
});
test('read-only operator cannot enter or submit token',async()=>{
 const window=new Window();globalThis.document=window.document;globalThis.window=window;const h=harness();const root=document.createElement('div');document.body.append(root);
 const view=mountSetup(root,{host:{...h.host,locale:'en',connection:{canAdmin:false,canRead:true,connected:true},subscribe:()=>()=>{}},signal:h.controller.signal,props:{},presented:true});
 assert.equal(root.querySelector('input').disabled,true);root.querySelector('form').dispatchEvent(new window.Event('submit'));assert.equal(h.calls.length,0);view.dispose();await window.happyDOM.close();
});

function memoryStorage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
test('committed secret with lost acknowledgement reconciles same protected entry without a second write',async()=>{
 let name,ref;const h=harness({
  'config.get':()=>({hash:'x',config:{plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref?.id}}}}}}),
  'secrets.store.set':p=>{name=p.name;throw Error('lost ack '+key);},
  'secrets.store.list':()=>({entries:[{name,kind:'secret'}]}),
  'config.patch':p=>{ref=JSON.parse(p.raw).plugins.entries.unifi.config.apiKey;return {ok:true};}
 });
 assert.deepEqual(await h.flow.connect(key,true),good);assert.equal(h.calls.filter(c=>c.method==='secrets.store.set').length,1);
 assert.equal(h.calls.find(c=>c.method==='unifi.connection.check').params.expectedRef.id,name);
});
test('unconfirmed secret write survives remount as token-free reference; resume binds same name',async()=>{
 const store=memoryStorage();let name,ref;const h=harness({
  'config.get':()=>({hash:'x',config:{plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref?.id}}}}}}),
  'secrets.store.set':p=>{name=p.name;throw Error('lost ack');},
  'secrets.store.list':()=>{throw Error('temporarily unavailable');},
  'config.patch':p=>{ref=JSON.parse(p.raw).plugins.entries.unifi.config.apiKey;return {ok:true};}
 });
 const first=new Onboarding(h.host,h.controller.signal,store);
 await assert.rejects(first.connect(key,true));assert.equal(first.canRetry,true);
 assert.ok(!JSON.stringify([...store.map.values()]).includes(key));
 const host={request:(method,params)=>method==='secrets.store.list'?Promise.resolve({entries:[{name,kind:'secret'}]}):h.host.request(method,params)};
 const second=new Onboarding(host,h.controller.signal,store);assert.equal(second.canRetry,true);assert.deepEqual(await second.connect('',true),good);
 assert.equal(h.calls.filter(c=>c.method==='secrets.store.set').length,1);assert.equal(store.map.size,0);
});
test('lost patch acknowledgement reconciles without replay only after persisted source and active expected-ref check',async()=>{
 let ref;const h=harness({'config.get':()=>({hash:'x',config:{plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref?.id}}}}}}),'config.patch':p=>{ref=JSON.parse(p.raw).plugins.entries.unifi.config.apiKey;throw Error('lost patch ack');}});
 assert.deepEqual(await h.flow.connect(key,true),good);assert.equal(h.calls.filter(c=>c.method==='config.patch').length,1);assert.deepEqual(h.calls.at(-1).params.expectedRef,ref);
});
test('persisted-but-inactive config never reports ready even if older key works',async()=>{
 let ref;const h=harness({'config.get':()=>({hash:'x',config:{plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref?.id}}}}}}),'config.patch':p=>{ref=JSON.parse(p.raw).plugins.entries.unifi.config.apiKey;throw Error('runtime application failed');},'unifi.connection.check':p=>{assert.deepEqual(p.expectedRef,ref);return {configured:true,connected:false,code:'configuration_not_active'};}});
 const r=await h.flow.connect(key,true);assert.equal(r.connected,false);assert.equal(h.flow.canRetry,true);
});
test('scheduled restart and degraded owner acknowledgement stay pending, not ready',async()=>{
 for(const ack of [{ok:true,restart:{scheduled:true}},{ok:true,degradedSecretOwners:[{}]},{ok:false}]){
 const h=harness({'config.patch':()=>ack});const r=await h.flow.connect(key,true);assert.equal(r.connected,false);assert.equal(r.code,'configuration_not_active');assert.equal(h.calls.some(c=>c.method==='unifi.connection.check'),false);}
});
test('backend rejects expected ref against old active source before any network call',async()=>{
 const ref={source:'store',provider:'default',id:'OPENCLAW_UNIFI_'+'A'.repeat(32)};const methods=new Map();
 const current={plugins:{entries:{unifi:{config:{apiKey:key}}}}};
 registerSetup({registerGatewayMethod:(n,h)=>methods.set(n,h),runtime:{config:{current:()=>current}}},()=>({plugins:{entries:{unifi:{config:{apiKey:{...ref,id:'OPENCLAW_UNIFI_'+'B'.repeat(32)}}}}}}));
 let output;await methods.get('unifi.connection.check')({params:{expectedRef:ref},respond:(...x)=>output=x});
 assert.deepEqual(output,[true,{configured:true,connected:false,code:'configuration_not_active'}]);
});
test('expired or malformed recovery metadata is dropped and cannot configure a consumer',()=>{
 for(const value of [{ref:{source:'store',provider:'default',id:'OTHER'},createdAt:Date.now()},{ref:{source:'store',provider:'default',id:'OPENCLAW_UNIFI_'+'A'.repeat(32)},createdAt:Date.now()-3_600_001}]){
 const storage=memoryStorage();storage.setItem('openclaw.unifi.setup.pending',JSON.stringify(value));const h=harness();const flow=new Onboarding(h.host,h.controller.signal,storage);assert.equal(flow.canRetry,false);assert.equal(storage.map.size,0);}
});
test('late initial status cannot overwrite completed connection result',async()=>{
 const window=new Window();globalThis.document=window.document;globalThis.window=window;let release;
 const h=harness({'unifi.connection.status':()=>new Promise(r=>release=r)});const root=document.createElement('div');document.body.append(root);
 const view=mountSetup(root,{host:{...h.host,basePath:'',locale:'en',connection:{canAdmin:true,canRead:true,connected:true},subscribe:()=>()=>{}},signal:h.controller.signal,props:{},presented:true});
 root.querySelector('input').value=key;root.querySelector('form').dispatchEvent(new window.Event('submit'));
 await new Promise(r=>setImmediate(r));assert.match(root.textContent,/Connected/);release({configured:false,connected:false});await new Promise(r=>setImmediate(r));assert.match(root.textContent,/Connected/);view.dispose();await window.happyDOM.close();
});
test('disposing page stops subsequent binding after pending secret save',async()=>{
 const window=new Window();globalThis.document=window.document;globalThis.window=window;let release;const pending=new Promise(r=>release=r);
 const h=harness({'secrets.store.set':()=>pending});const root=document.createElement('div');document.body.append(root);
 const view=mountSetup(root,{host:{...h.host,basePath:'',locale:'en',connection:{canAdmin:true,canRead:true,connected:true},subscribe:()=>()=>{}},signal:h.controller.signal,props:{},presented:true});
 root.querySelector('input').value=key;root.querySelector('form').dispatchEvent(new window.Event('submit'));await new Promise(r=>setImmediate(r));view.dispose();release({ok:true});await new Promise(r=>setImmediate(r));
 assert.equal(h.calls.some(c=>c.method==='config.patch'),false);assert.equal(root.childNodes.length,0);await window.happyDOM.close();
});

test('corrected nonempty token after 403 creates fresh entry and does not overwrite old value',async()=>{
 let ref;const values=new Map();let attempt=0;
 const h=harness({'config.get':()=>({hash:'x',config:{plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref?.id}}}}}}),'secrets.store.set':p=>{assert.equal(values.has(p.name),false);values.set(p.name,p.value);return {ok:true};},'config.patch':p=>{ref=JSON.parse(p.raw).plugins.entries.unifi.config.apiKey;return {ok:true};},'unifi.connection.check':()=>++attempt===1?{configured:true,connected:false,status:403}:good});
 assert.equal((await h.flow.connect(key,true)).connected,false);const oldRef={...ref};assert.equal(h.flow.canRetry,true);
 assert.deepEqual(await h.flow.connect('different-synthetic-token',true),good);assert.notEqual(ref.id,oldRef.id);assert.equal(values.get(oldRef.id),key);assert.equal(values.get(ref.id),'different-synthetic-token');assert.equal(values.size,2);
 const sets=h.calls.filter(c=>c.method==='secrets.store.set');assert.notEqual(sets[0].params.name,sets[1].params.name);
});
test('matched new source with retained old resolved runtime generation is blocked before old-key 200',async()=>{
 const ref={source:'store',provider:'default',id:'OPENCLAW_UNIFI_'+'C'.repeat(32)};const methods=new Map();let sent=0;
 const original=globalThis.fetch;globalThis.fetch=async()=>{sent++;return new Response('{"data":[]}');};
 try{
 const current={plugins:{entries:{unifi:{config:{apiKey:'old-still-working-key',setupBinding:'OPENCLAW_UNIFI_'+'D'.repeat(32)}}}}};
 registerSetup({registerGatewayMethod:(n,h)=>methods.set(n,h),runtime:{config:{current:()=>current}}},()=>({plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref.id}}}}}));
 let output;await methods.get('unifi.connection.check')({params:{expectedRef:ref},respond:(...x)=>output=x});
 assert.equal(output[1].connected,false);assert.equal(output[1].code,'configuration_not_active');assert.equal(sent,0);
 }finally{globalThis.fetch=original;}
});
test('matching resolved marker, source and stable snapshot use the new key; snapshot changes invalidate result',async()=>{
 const ref={source:'store',provider:'default',id:'OPENCLAW_UNIFI_'+'E'.repeat(32)};
 for(const drift of [false,true]){
 const methods=new Map();let current={plugins:{entries:{unifi:{config:{apiKey:key,setupBinding:ref.id}}}}};let sent;
 registerSetup({registerGatewayMethod:(n,h)=>methods.set(n,h),runtime:{config:{current:()=>current}}},()=>({plugins:{entries:{unifi:{config:{apiKey:ref,setupBinding:ref.id}}}}}));
 const original=globalThis.fetch;globalThis.fetch=async(_url,init)=>{sent=init.headers['X-API-KEY'];if(drift)current={plugins:{entries:{unifi:{config:{apiKey:'replacement',setupBinding:ref.id}}}}};return new Response('{"data":[]}');};
 try{let output;await methods.get('unifi.connection.check')({params:{expectedRef:ref},respond:(...x)=>output=x});assert.equal(sent,key);assert.equal(output[1].connected,!drift);if(drift)assert.equal(output[1].code,'configuration_not_active');}
 finally{globalThis.fetch=original;}
 }
});

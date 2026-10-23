import test from "node:test";
import assert from "node:assert/strict";
import {UniFiClient} from "../dist/client.js";
import {prepareRequest} from "../dist/request.js";
import {createTool} from "../dist/tools.js";
import {errorDetails} from "../dist/errors.js";
const key="synthetic-api-key-not-a-credential";
const read=()=>prepareRequest({operationId:"listSites"},false);
const write=()=>prepareRequest({operationId:"ConnectorPost",path:{id:"c",path:"network/integration/v1/sites"},body:{name:"x"}},true);
const fetcher=(response)=>async()=>response;

test("transport builds fixed HTTPS request with auth, JSON, redirect and cache protections",async()=>{
 let call;
 const client=new UniFiClient({apiKey:key},{fetch:async(url,init)=>{call={url,init};return new Response(null,{status:204});}});
 const result=await client.request(write());
 assert.equal(result.status,204);assert.equal(result.data,null);
 assert.equal(call.url.origin,"https://api.ui.com");assert.equal(call.init.method,"POST");assert.equal(call.init.body,'{"name":"x"}');
 assert.equal(call.init.headers.Accept,"application/json");assert.equal(call.init.headers["Content-Type"],"application/json");assert.equal(call.init.headers["X-API-KEY"],key);
 assert.equal(call.init.redirect,"error");assert.equal(call.init.credentials,"omit");assert.equal(call.init.cache,"no-store");assert.equal(call.init.signal instanceof AbortSignal,true);
});
test("credential-unavailable fails closed for raw SecretRefs and never fetches",async()=>{
 let calls=0;
 for(const apiKey of [undefined,"",key+"\n",{source:"store",provider:"default",id:"UNIFI_API_KEY"}]){
  const c=new UniFiClient({apiKey},{fetch:async()=>{calls++;throw Error("must not call");}});
  await assert.rejects(()=>c.request(read()),/credential_unavailable/);
 }
 assert.equal(calls,0);
});
test("arbitrary destinations rejected before credentials/network",async()=>{
 const c=new UniFiClient({apiKey:key},{fetch:async()=>{assert.fail("fetch");}});
 for(const url of ["https://evil.example/v1/sites","http://api.ui.com/v1/sites","https://api.ui.com.evil.example/v1/sites","https://user:pass@api.ui.com/v1/sites"]){
  await assert.rejects(()=>c.request({...read(),url:new URL(url)}),/invalid_destination/);
 }
});
test("redirect response rejected and upstream body is never returned",async()=>{
 let cancelled=false;
 const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:302,headers:{location:"https://evil.example/"+key}});
 const c=new UniFiClient({apiKey:key},{fetch:fetcher(response)});
 const e=await c.request(read()).catch(e=>e);
 assert.deepEqual(errorDetails(e),{ok:false,error:{code:"redirect_rejected",status:302}});
 assert.equal(cancelled,true);assert.equal(JSON.stringify(errorDetails(e)).includes(key),false);
});
test("HTTP failures are structured, sanitized and never retried (including rate limits)",async()=>{
 for(const status of [400,401,403,404,408,429,500,502,503]){
  let calls=0,cancelled=false;
  const c=new UniFiClient({apiKey:key},{fetch:async()=>{calls++;return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(key));},cancel(){cancelled=true;}}),{status,headers:{"Retry-After":"1","X-Secret":key}});}});
  const err=await c.request(write()).catch(e=>e);
  const result=errorDetails(err);
  assert.equal(calls,1);assert.equal(cancelled,true);
  assert.equal(result.error.code,"http_error");assert.equal(result.error.status,status);
  assert.equal(result.error.outcome,status>=500?"unknown":undefined);
  assert.equal(JSON.stringify(result).includes(key),false);
 }
});
test("response byte bounds apply to content length and streamed chunks, with cancellation",async()=>{
 for(const declared of [true,false]){
  let cancelled=false;
  const c=new UniFiClient({apiKey:key,maxResponseBytes:1024},{fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(1025));},cancel(){cancelled=true;}}),{headers:declared?{"content-length":"1025"}:{}})});
  await assert.rejects(()=>c.request(write()),e=>e.code==="response_too_large"&&e.outcome==="unknown");
  assert.equal(cancelled,true);
 }
});
test("successful secret echoes are redacted in nested strings and keys without altering scalar JSON",async()=>{
 for(const apiKey of [key,"a","true"]){
  const body={echo:"prefix "+apiKey+" suffix",nested:[{[apiKey]:apiKey}],B:true,N:42,Z:null,encoded:encodeURIComponent(apiKey)};
  const c=new UniFiClient({apiKey},{fetch:fetcher(new Response(JSON.stringify(body)))});
  const r=await c.request(read());
  assert.equal(r.data.echo,"prefix [REDACTED] suffix");assert.equal(r.data.nested[0]["[REDACTED]"],"[REDACTED]");
  assert.equal(r.data.B,true);assert.equal(r.data.N,42);assert.equal(r.data.Z,null);
 }
});
test("invalid JSON response and thrown transport details never expose provider text",async()=>{
 for(const mock of [fetcher(new Response(key)),async()=>{throw Error("X-API-KEY="+key);}]){
  const c=new UniFiClient({apiKey:key},{fetch:mock});
  const r=errorDetails(await c.request(write()).catch(e=>e));
  assert.ok(["invalid_json_response","transport_error"].includes(r.error.code));
  assert.equal(r.error.outcome,"unknown");assert.equal(JSON.stringify(r).includes(key),false);
 }
});
test("abort before send performs no network call",async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const c=new UniFiClient({apiKey:key},{fetch:async()=>{calls++;throw Error("fetch");}});
 await assert.rejects(()=>c.request(write(),controller.signal),e=>e.code==="cancelled");
 assert.equal(calls,0);
});
test("cancellation interrupts stalled response reads and cancels stream",async()=>{
 let cancelled=false,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const controller=new AbortController();
 const c=new UniFiClient({apiKey:key},{fetch:async()=>{started();return new Response(new ReadableStream({cancel(){cancelled=true;}}));}});
 const pending=c.request(write(),controller.signal);
 await ready;controller.abort();
 await assert.rejects(()=>pending,e=>e.code==="cancelled"&&e.outcome==="unknown");
 assert.equal(cancelled,true);
});
test("whole-operation deadline interrupts stalled fetch and response even if a mock ignores the signal",async()=>{
 // Keep the event loop alive: AbortSignal.timeout intentionally uses an unref timer.
 const keepAlive=setInterval(()=>{},1000);
 try{
  for(const stage of ["fetch","body"]){
   const c=new UniFiClient({apiKey:key,requestTimeoutMs:100},{fetch:stage==="fetch"?()=>new Promise(()=>{}):async()=>new Response(new ReadableStream())});
   const start=Date.now();
   await assert.rejects(()=>c.request(write()),e=>e.code==="timeout"&&e.outcome==="unknown");
   assert.ok(Date.now()-start<1500);
  }
 }finally{clearInterval(keepAlive);}
});
test("live authority guard can prevent mutation immediately before fetch",async()=>{
 let calls=0;
 const c=new UniFiClient({apiKey:key},{assertCurrent(){throw Error("retired");},fetch:async()=>{calls++;return new Response("{}");}});
 await assert.rejects(()=>c.request(write()),/transport_error/);assert.equal(calls,0);
});
test("connector methods forward non-GET verbs and JSON without retry or GET downgrading",async()=>{
 for(const [id,method]of [["ConnectorPost","POST"],["ConnectorPut","PUT"],["ConnectorPatch","PATCH"],["ConnectorDelete","DELETE"]]){
  let calls=0;
  const c=new UniFiClient({apiKey:key},{fetch:async(_,init)=>{calls++;assert.equal(init.method,method);assert.equal(init.body,'{"nested":{"on":true}}');return new Response("{}");}});
  const p=prepareRequest({operationId:id,path:{id:"c",path:"protect/integration/v1/viewers/123"},query:{"ids[]":["1","2"]},body:{nested:{on:true}}},true);
  assert.deepEqual(p.url.searchParams.getAll("ids[]"),["1","2"]);
  await c.request(p);assert.equal(calls,1);
 }
});

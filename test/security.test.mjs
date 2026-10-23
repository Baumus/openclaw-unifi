import test from "node:test";
import assert from "node:assert/strict";
import {catalog} from "../dist/catalog.js";
import {createTool} from "../dist/tools.js";
import {prepareRequest,appendQuery} from "../dist/request.js";
import {validateValue,validatePlainJson} from "../dist/schema.js";
import {inputFor,uuid} from "./fixtures.mjs";

for(const op of catalog.operations.filter(o=>o.method!=="GET"))test("invalid mutation rejected before credentials/network "+op.operationId,async()=>{
 let reads=0,calls=0;
 const tool=createTool("unifi_request_write",{pluginConfig:{}},{getRuntimeConfig(){reads++;throw Error("must not read credentials");}},{fetch:async()=>{calls++;throw Error("must not fetch");}});
 const args=inputFor(op);
 if(op.parameters.some(p=>p.in==="path"&&p.required))delete args.path;
 else if(op.requestBody?.required)delete args.body;
 else args.path={unexpected:"x"};
 const r=await tool.execute("test",args);
 assert.equal(r.isError,true);assert.equal(reads,0);assert.equal(calls,0);
 assert.notEqual(r.details.error.code,"internal_error");
});

test("SSRF, traversal and encoded separators rejected before credentials",async()=>{
 const paths=["../protect/integration/v1","network/../integration/v1","https://evil.example/path","//evil.example/a","network/%2e%2e/a","network/%252f/a","network/a\\b","network/a?x=y","network/a#b","network//a","network/./a","network/a\n"];
 for(const path of paths)assert.throws(()=>prepareRequest({operationId:"ConnectorGet",path:{id:"console",path}},false));
 for(const id of ["..",".","a/b","a%2fb","x?y","x#y","x\\y","x\n"])assert.throws(()=>prepareRequest({operationId:"getInfo",consoleId:id},false));
 assert.throws(()=>prepareRequest({operationId:"getInfo",consoleId:"c",url:"https://evil.example"},false),/unknown_request_field/);
 assert.throws(()=>prepareRequest({operationId:"getInfo",consoleId:"c",headers:{"X-API-KEY":"override"}},false),/unknown_request_field/);
 const canonical=prepareRequest({operationId:"ConnectorGet",path:{id:"console:123",path:"/proxy/protect/integration/v1/meta/info"}},false);
 assert.equal(canonical.url.pathname,"/v1/connector/consoles/console%3A123/proxy/protect/integration/v1/meta/info");
});

test("envelope closure and wrong execution surface fail closed",()=>{
 assert.throws(()=>prepareRequest(inputFor(catalog.operations.find(o=>o.operationId==="createNetwork")),false),/wrong_request_tool/);
 assert.throws(()=>prepareRequest({operationId:"getInfo",consoleId:"c"},true),/wrong_request_tool/);
 assert.throws(()=>prepareRequest({operationId:"listSites",consoleId:"c"},false),/irrelevant_console_id/);
 assert.throws(()=>prepareRequest({operationId:"getInfo",consoleId:"c",body:{}},false),/unexpected_body/);
 assert.throws(()=>prepareRequest({operationId:"getInfo",consoleId:"c",query:{limit:1}},false),/unknown_query_parameter/);
 assert.throws(()=>prepareRequest({operationId:"getCountries",consoleId:"c",query:{offset:"1"}},false),/schema_validation/);
 assert.throws(()=>prepareRequest({operationId:"getCountries",consoleId:"c",query:{limit:201}},false),/schema_validation/);
 assert.throws(()=>prepareRequest({operationId:"deleteVouchers",consoleId:"c",path:{siteId:uuid}},true),/missing_parameter/);
 assert.throws(()=>prepareRequest({operationId:"getFirewallPolicyOrdering",consoleId:"c",path:{siteId:uuid},query:{sourceFirewallZoneId:uuid}},false),/missing_parameter/);
 assert.throws(()=>prepareRequest({operationId:"getNetworkDetails",consoleId:"c",path:{siteId:"bad",networkId:uuid}},false),/schema_validation/);
});

test("refs, allOf and discriminator dispatch require subtype fields and preserve valid properties",()=>{
 const base={operationId:"createNetwork",consoleId:"c",path:{siteId:uuid}};
 assert.throws(()=>prepareRequest({...base,body:{management:"GATEWAY",enabled:true,name:"LAN",vlanId:2}},true),/schema_validation/);
 assert.throws(()=>prepareRequest({...base,body:{management:"NOT_REAL",enabled:true,name:"LAN",vlanId:2}},true),/schema_validation/);
 const unmanaged={management:"UNMANAGED",enabled:true,name:"LAN",vlanId:2};
 const plan=prepareRequest({...base,body:unmanaged},true);
 assert.deepEqual(JSON.parse(plan.body),unmanaged);
 assert.throws(()=>prepareRequest({operationId:"executeAdoptedDeviceAction",consoleId:"c",path:{siteId:uuid,deviceId:uuid},body:{action:"DELETE_ALL"}},true),/schema_validation/);
 validateValue("site-manager",{type:"object",allOf:[{required:["a"],properties:{a:{type:"integer"}}},{required:["b"],properties:{b:{type:"boolean"}}}]},{a:2,b:true});
 assert.throws(()=>validateValue("site-manager",{oneOf:[{type:"integer"},{type:"string"}]},false),/schema_validation/);
 assert.throws(()=>validateValue("site-manager",{oneOf:[{type:"number"},{type:"integer"}]},1),/schema_validation/);
 validateValue("site-manager",{type:"string",nullable:true},null);
});

test("invalid JSON, accessors, prototypes and size/depth are rejected",()=>{
 for(const value of [NaN,Infinity,undefined,()=>{},JSON.parse('{"__proto__":{"polluted":true}}'),{constructor:"x"},new Date()])assert.throws(()=>validatePlainJson(value));
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>validatePlainJson(cyclic),/invalid_json/);
 let ran=false;const accessor={};Object.defineProperty(accessor,"secret",{enumerable:true,get(){ran=true;return "x";}});
 assert.throws(()=>validatePlainJson(accessor),/invalid_json/);assert.equal(ran,false);
 assert.throws(()=>validatePlainJson("x".repeat(1048576)),/request_too_large/);
 let deep={};for(let i=0;i<50;i++)deep={deep};assert.throws(()=>validatePlainJson(deep),/request_too_complex/);
});

test("OpenAPI serialization: array styles, object form and JSON content",()=>{
 const u=new URL("https://api.ui.com/v1/test");
 appendQuery(u,{name:"items",in:"query",style:"form",explode:false},["a","b"]);
 appendQuery(u,{name:"spaces",in:"query",style:"spaceDelimited"},["a","b"]);
 appendQuery(u,{name:"pipes",in:"query",style:"pipeDelimited"},["a","b"]);
 appendQuery(u,{name:"filter",in:"query",style:"deepObject"},{on:true,n:2});
 appendQuery(u,{name:"obj",in:"query",style:"form",explode:true},{enabled:false});
 appendQuery(u,{name:"json",in:"query",content:{"application/json":{schema:{}}}},{nested:{a:1}});
 assert.equal(u.searchParams.get("items"),"a,b");assert.equal(u.searchParams.get("spaces"),"a b");assert.equal(u.searchParams.get("pipes"),"a|b");
 assert.equal(u.searchParams.get("filter[on]"),"true");assert.equal(u.searchParams.get("enabled"),"false");assert.deepEqual(JSON.parse(u.searchParams.get("json")),{nested:{a:1}});
 assert.throws(()=>appendQuery(u,{name:"filter",in:"query"},{nested:{a:1}}),/invalid_query_serialization/);
});

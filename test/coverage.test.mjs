import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {catalog,specs,discover,describe,sourceRef} from "../dist/catalog.js";
import {prepareRequest} from "../dist/request.js";
import {createTool} from "../dist/tools.js";
import {inputFor,uuid} from "./fixtures.mjs";

test("coverage exactly equals every source API method; pinned bytes and counts",()=>{
 const expected=[];
 for(const source of catalog.sources){
  const bytes=readFileSync(new URL("../specs/"+source.file,import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"),source.sha256);
  for(const [path,pi]of Object.entries(specs[source.api].paths))for(const [method,op]of Object.entries(pi))if(["get","post","put","patch","delete"].includes(method))expected.push([source.api,(["site-manager","network"].includes(source.api)?op.operationId:source.api+":"+(op.operationId??method+":"+path)),method.toUpperCase(),path].join("|"));
 }
 assert.deepEqual(catalog.operations.map(o=>[o.api,o.operationId,o.method,o.path].join("|")).sort(),expected.sort());
 assert.equal(expected.length,186);
 assert.equal(catalog.operations.filter(o=>o.api==="site-manager").length,14);
 assert.equal(catalog.operations.filter(o=>o.api==="network").length,73);
 assert.deepEqual(Object.fromEntries(["GET","POST","PUT","PATCH","DELETE"].map(m=>[m,catalog.operations.filter(o=>o.method===m).length])),{GET:103,POST:36,PUT:15,PATCH:18,DELETE:14});
});

for(const op of catalog.operations.filter(o=>o.availability.status==="supported"))test("executable official operation "+op.operationId,async()=>{
 const args=inputFor(op);
 const write=op.method!=="GET";
 const plan=prepareRequest(args,write);
 assert.equal(plan.url.origin,"https://api.ui.com");
 if(["network","protect","innerspace"].includes(op.api))assert.equal(plan.url.pathname.startsWith("/v1/connector/consoles/console%3A123/proxy/"+op.api+"/integration/v1/"),true);
 else assert.ok(plan.url.pathname.startsWith("/v1/"));
 let calls=0,configReads=0,guard=0;
 const tool=createTool(write?"unifi_request_write":"unifi_request",{pluginConfig:{}},{
  getRuntimeConfig(){configReads++;return {plugins:{entries:{unifi:{config:{apiKey:"synthetic-test-key-87"}}}}};},
  assertInvocationCurrent(){guard++;}
 },{media:{read:async()=>({buffer:Buffer.from("fixture"),size:7,id:uuid+".png",path:"PRIVATE"}),detect:async({buffer})=>op.operationId.includes("snapshot")?"image/jpeg":"image/png",save:async()=>({id:uuid+".png",path:"PRIVATE",size:7})},fetch:async(url,init)=>{
  calls++;assert.equal(init.method,op.method);assert.equal(init.headers["X-API-KEY"],"synthetic-test-key-87");assert.equal(init.redirect,"error");assert.equal(init.credentials,"omit");
  assert.equal(url.href,plan.url.href);
  if(op.requestBody?.content["application/json"])assert.deepEqual(JSON.parse(init.body),args.body);
  if(op.requestBody?.content["multipart/form-data"]){assert.ok(init.body instanceof FormData);assert.equal(init.body.get("file").type,"image/png");assert.equal(init.headers["Content-Type"],undefined);}
  if(plan.responseMedia)return new Response("fixture",{headers:{"Content-Type":"image/png" in Object.fromEntries(plan.responseMedia.map(m=>[m,1]))?"image/png":"image/jpeg"}});
  return new Response(JSON.stringify({operation:op.operationId}),{status:200,headers:{"Content-Type":"application/json"}});
 }});
 const result=await tool.execute("test",args);
 assert.equal(result.isError,undefined,JSON.stringify(result.details));
 if(plan.responseMedia){assert.equal(result.details.media.ref,"unifi:"+uuid+".png");assert.equal(JSON.stringify(result).includes("PRIVATE"),false);}
 else assert.equal(result.details.data.operation,op.operationId);
 assert.equal(calls,1);assert.equal(configReads,1);assert.ok(guard>=2);
});

test("discovery cursors are complete, bound to filters and do not need credentials",()=>{
 const ids=[];let cursor;
 do{const page=discover({limit:7,cursor});ids.push(...page.operations.map(o=>o.operationId));cursor=page.cursor;}while(cursor);
 assert.deepEqual(ids,catalog.operations.map(o=>o.operationId));
 const page=discover({search:"Network",limit:1});
 assert.throws(()=>discover({search:"device",cursor:page.cursor}),/invalid_cursor/);
 assert.throws(()=>discover({cursor:"!no"}),/invalid_cursor/);
 assert.equal(discover({method:"DELETE"}).total,14);
});

test("describe provides complete references including discriminator subtypes and required envelopes",()=>{
 for(const op of catalog.operations){
  const d=describe(op.operationId);
  const available=d.components.schemas;
  const seen=new Set();
  function walk(v){
   if(!v||typeof v!=="object")return;
   for(const[k,x]of Object.entries(v)){
    if(k==="$ref"&&typeof x==="string"&&!seen.has(x)){
     seen.add(x);const name=decodeURIComponent(x.split("/").at(-1)).replace(/~1/g,"/").replace(/~0/g,"~");
     assert.ok(available[name],op.operationId+" missing "+x);walk(sourceRef(op.api,x));
    }else if(k==="mapping"&&x&&typeof x==="object"){for(const ref of Object.values(x))if(typeof ref==="string")walk({$ref:ref});}
    else walk(x);
   }
  }
  walk(op);
  if(op.parameters.some(p=>p.in==="path"&&p.required))assert.ok(d.requestSchema.required.includes("path"));
  if(op.parameters.some(p=>p.in==="query"&&p.required))assert.ok(d.requestSchema.required.includes("query"));
  if(op.requestBody?.content["multipart/form-data"])assert.ok(d.requestSchema.required.includes("media"));
  else if(op.requestBody?.required)assert.ok(d.requestSchema.required.includes("body"));
  assert.equal(d.sideEffecting,op.method!=="GET");
 }
});

test("source API query and numeric path serialization is exact",()=>{
 const url=prepareRequest({operationId:"listDevices",query:{"hostIds[]":["a:b","c d"],pageSize:"10",nextToken:"a%2Fb+/="}},false).url;
 assert.deepEqual(url.searchParams.getAll("hostIds[]"),["a:b","c d"]);
 assert.equal(url.searchParams.get("nextToken"),"a%2Fb+/=");
 const q=prepareRequest({operationId:"getCountries",consoleId:"console",query:{offset:5,limit:20,filter:"name.like('a & b')"}},false).url;
 assert.equal(q.searchParams.get("filter"),"name.like('a & b')");
 const path=prepareRequest({operationId:"executePortAction",consoleId:"c",path:{siteId:uuid,deviceId:uuid,portIdx:3},body:{action:"POWER_CYCLE"}},true).url.pathname;
 assert.ok(path.endsWith("/interfaces/ports/3/actions"));
});

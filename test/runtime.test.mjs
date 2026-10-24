import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Ajv} from "ajv";
import entry from "../dist/index.js";
import {createTool,toolDefinitions,toolMetadata} from "../dist/tools.js";
import {currentConfig,ConfigSchema} from "../dist/config.js";
import {getToolPluginMetadata} from "openclaw/plugin-sdk/tool-plugin";

test("manifest, entry metadata and runtime registrations agree, including honest side effects",()=>{
 const manifest=JSON.parse(readFileSync(new URL("../openclaw.plugin.json",import.meta.url)));
 const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url)));assert.equal(manifest.version,pkg.version);
 const registered=[];
 entry.register({pluginConfig:{},registerReload(){},registerGatewayMethod(){},registerTool(factory,options){registered.push({factory,options});}});
 const names=registered.map(x=>x.options.name);
 assert.deepEqual(names,manifest.contracts.tools);assert.deepEqual(names,getToolPluginMetadata(entry).tools.map(t=>t.name));
 assert.deepEqual(manifest.toolMetadata,toolMetadata);
 for(const reg of registered){const tool=reg.factory({});assert.equal(tool.name,reg.options.name);}
 assert.equal(manifest.toolMetadata.unifi_request.sideEffecting,false);
 assert.equal(manifest.toolMetadata.unifi_request.replaySafe,true);
 assert.equal(manifest.toolMetadata.unifi_request_write.sideEffecting,true);
 assert.equal(manifest.toolMetadata.unifi_request_write.replaySafe,false);
 assert.deepEqual(manifest.configContracts.secretInputs.paths,[{path:"apiKey",expected:"string",ownerKind:"capability"}]);
 assert.equal(manifest.uiHints.apiKey.sensitive,true);
 assert.ok(manifest.skills.includes("./skills"));
});
test("config accepts only structured SecretRefs; plaintext values and header overrides are rejected",()=>{
 const validate=new Ajv({strict:false}).compile(JSON.parse(JSON.stringify(ConfigSchema)));
 for(const source of ["store","env","file","exec"])assert.equal(validate({apiKey:{source,provider:"default",id:source==="file"?"/unifi/apiKey":"UNIFI_API_KEY"}}),true);
 for(const apiKey of ["plaintext","$UNIFI_API_KEY","\u0024{UNIFI_API_KEY}",{source:"store",id:"UNIFI_API_KEY"},{source:"unknown",provider:"default",id:"x"},{source:"env",provider:"default",id:"X",extra:"x"}])assert.equal(validate({apiKey}),false);
 assert.equal(validate({baseUrl:"https://evil.example"}),false);assert.equal(validate({headers:{"X-API-KEY":"x"}}),false);
});
test("runtime config reads the current snapshot and never falls back from unavailable/removed credentials",async()=>{
 const old="synthetic-old-runtime-key",fresh="synthetic-fresh-runtime-key";
 let config={plugins:{entries:{unifi:{config:{apiKey:fresh}}}}};
 const api={pluginConfig:{apiKey:old}};
 const context={getRuntimeConfig:()=>config};
 let received;
 const tool=createTool("unifi_request",api,context,{fetch:async(_,init)=>{received=init.headers["X-API-KEY"];return new Response("{}");}});
 await tool.execute("1",{operationId:"listSites"});assert.equal(received,fresh);
 config={plugins:{entries:{unifi:{config:{apiKey:"synthetic-rotated-runtime-key"}}}}};
 await tool.execute("2",{operationId:"listSites"});assert.equal(received,"synthetic-rotated-runtime-key");
 config={};received=undefined;
 const r=await tool.execute("3",{operationId:"listSites"});assert.equal(r.details.error.code,"credential_unavailable");assert.equal(received,undefined);
 config=undefined;
 assert.deepEqual(currentConfig(api,context),{});
 assert.equal(currentConfig(api,{runtimeConfig:{}}).apiKey,undefined);
 assert.equal(currentConfig(api,{}).apiKey,old);
});
test("local discovery and description work without credentials; status does not claim authentication",async()=>{
 for(const name of ["unifi_discover","unifi_describe"]){
  let configReads=0;
  const t=createTool(name,{pluginConfig:{}},{getRuntimeConfig(){configReads++;throw Error("must not access");}});
  const r=await t.execute("local",name==="unifi_describe"?{operationId:"createNetwork"}:{});
  assert.equal(r.isError,undefined);assert.equal(configReads,0);
 }
 const r=await createTool("unifi_status",{pluginConfig:{}},{}).execute("local",{});
 assert.equal(r.details.configured,false);assert.equal(r.details.authenticated,"not_checked");assert.equal(r.details.operations,186);
 assert.equal(JSON.stringify(r).includes("X-API-KEY"),false);
});

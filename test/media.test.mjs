import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createTool,toolMetadata} from "../dist/tools.js";
import {prepareRequest} from "../dist/request.js";
import {describe,discover,catalog} from "../dist/catalog.js";
import {MAX_MEDIA_BYTES,uploadMimes,hostMediaIO,multipartFromMedia} from "../dist/media.js";
import {validateValue} from "../dist/schema.js";
import {inputFor,uuid} from "./fixtures.mjs";

const png=readFileSync(new URL("../assets/icon.png",import.meta.url));
const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xd9]);
const config={pluginConfig:{apiKey:"synthetic-media-token"}};
const upload={operationId:"protect:post:/v1/files/{fileType}",consoleId:"console:123",path:{fileType:"animations"},media:{ref:"inbound:"+uuid+".png",mime:"image/png"}};
const snapshot={operationId:"protect:get:/v1/cameras/{id}/snapshot",consoleId:"console:123",path:{id:"camera"}};
const asset={operationId:"innerspace:get:/v1/assets/{planId}/{filename}",consoleId:"console:123",path:{planId:uuid,filename:"plan.png"}};
function io(overrides={}) {
 return {read:async()=>({id:uuid+".png",path:"/PRIVATE/not-returned",buffer:png,size:png.length}),detect:hostMediaIO.detect,save:async(buffer,mime,subdir,maxBytes,_name,_hint,options)=>{
  assert.equal(subdir,"unifi");assert.equal(maxBytes,MAX_MEDIA_BYTES);options.assertCommitAllowed();
  return {id:uuid+(mime==="image/png"?".png":".jpg"),path:"/PRIVATE/not-returned",size:buffer.length,contentType:mime};
 },...overrides};
}
for(const [args,bytes,mime] of [[snapshot,jpeg,"image/jpeg"],[asset,png,"image/png"],[asset,jpeg,"image/jpeg"]])test("binary response is opaque bounded media: "+args.operationId+" "+mime,async()=>{
 let saves=0;
 const media=io({save:async(...args)=>{saves++;return io().save(...args);}});
 const r=await createTool("unifi_request",config,{}, {media,fetch:async(url,init)=>{
  assert.ok(init.headers.Accept.includes(mime));assert.equal(url.origin,"https://api.ui.com");
  return new Response(bytes,{headers:{"Content-Type":mime}});
 }}).execute("download",args);
 assert.equal(r.isError,undefined,JSON.stringify(r.details));assert.equal(r.details.media.mime,mime);assert.equal(r.details.media.size,bytes.length);assert.equal(saves,1);
 assert.deepEqual(Object.keys(r.details).sort(),["media","ok","status"]);
 const rendered=JSON.stringify(r);
 for(const forbidden of ["/PRIVATE","base64","data:image","synthetic-media-token",bytes.toString("base64")])assert.equal(rendered.includes(forbidden),false);
});
test("binary response rejects mismatched MIME, unsupported type, empty and oversized bytes before store",async()=>{
 for(const [bytes,headers,code] of [
  [png,{"Content-Type":"image/jpeg"},"media_mime_mismatch"],
  [png,{"Content-Type":"application/json"},"unsupported_media_response"],
  [png,{},"unsupported_media_response"],
  [Buffer.alloc(0),{"Content-Type":"image/png"},"invalid_media_size"],
  [png,{"Content-Type":"image/png","Content-Length":String(MAX_MEDIA_BYTES+1)},"response_too_large"],
  [Buffer.alloc(MAX_MEDIA_BYTES+1),{"Content-Type":"image/png"},"response_too_large"],
 ]){
  let saves=0;
  const r=await createTool("unifi_request",config,{}, {media:io({save:async()=>{saves++;throw Error("must not save");}}),fetch:async()=>new Response(bytes,{headers})}).execute("bad-download",asset);
  assert.equal(r.details.error.code,code);assert.equal(saves,0);
 }
});
test("revoked invocation prevents binary host commit, including after awaited MIME detection",async()=>{
 let live=true,saves=0;
 const r=await createTool("unifi_request",config,{assertInvocationCurrent(){if(!live)throw Error("revoked");}},{
  media:io({detect:async()=>{live=false;return "image/png";},save:async()=>{saves++;throw Error("must not commit");}}),
  fetch:async()=>new Response(png,{headers:{"Content-Type":"image/png"}})
 }).execute("revoked",asset);
 assert.equal(r.isError,true);assert.equal(saves,0);assert.equal(JSON.stringify(r).includes("revoked"),false);
});
test("multipart upload uses SDK ID read, actual MIME, one file part, no JSON downgrade and no manual boundary",async()=>{
 let reads=0,calls=0,guards=0;
 const r=await createTool("unifi_request_write",config,{assertInvocationCurrent(){guards++;}},{media:io({read:async(id,subdir,cap)=>{
  reads++;assert.equal(id,uuid+".png");assert.equal(subdir,"inbound");assert.equal(cap,MAX_MEDIA_BYTES);return io().read();
 }}),fetch:async(url,init)=>{
  calls++;assert.equal(url.pathname,"/v1/connector/consoles/console%3A123/proxy/protect/integration/v1/files/animations");
  assert.equal(init.method,"POST");assert.equal(init.headers["Content-Type"],undefined);assert.ok(init.body instanceof FormData);
  const parts=[...init.body];assert.equal(parts.length,1);assert.equal(parts[0][0],"file");
  const file=parts[0][1];assert.equal(file.type,"image/png");assert.equal(file.name,"asset.png");assert.deepEqual(Buffer.from(await file.arrayBuffer()),png);
  const wire=new Request(url,init);assert.match(wire.headers.get("content-type"),/^multipart\/form-data; boundary=/);
  return new Response('{"name":"stored"}',{headers:{"Content-Type":"application/json"}});
 }}).execute("upload",upload);
 assert.equal(r.isError,undefined,JSON.stringify(r.details));assert.equal(reads,1);assert.equal(calls,1);assert.ok(guards>=4);
 assert.deepEqual(toolMetadata.unifi_request_write,{replaySafe:false,sideEffecting:true});
});
for(const mime of uploadMimes)test("upload declared allowed MIME "+mime+" is sniff-checked and preserved",async()=>{
 // Transport contract test with injected detector; actual host sniffing separately
 // proves png/jpeg and alias handling, not audio decoder validity.
 const form=await multipartFromMedia({...upload.media,mime},io({detect:async()=>mime}));
 assert.equal(form.get("file").type,mime);
});
test("real host detector validates each declared upload format from byte signatures, not supplied MIME",async()=>{
 const wav=Buffer.alloc(44);wav.write("RIFF");wav.writeUInt32LE(36,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);
 const mp3=Buffer.alloc(2048);mp3.set([0xff,0xfb,0x90,0x64]);
 const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from("ftypM4A "),Buffer.alloc(4),Buffer.from("M4A isom")]);
 const caf=Buffer.concat([Buffer.from("caff"),Buffer.from([0,1,0,0]),Buffer.alloc(24)]);
 const gif=Buffer.concat([Buffer.from("GIF89a"),Buffer.from([1,0,1,0,0,0,0,0x3b])]);
 for(const [mime,buffer] of [["image/gif",gif],["image/jpeg",jpeg],["image/png",png],["audio/mpeg",mp3],["audio/mp4",mp4],["audio/wave",wav],["audio/x-caf",caf]]){
  const form=await multipartFromMedia({...upload.media,mime},io({read:async()=>({buffer})}));
  assert.equal(form.get("file").type,mime);
 }
});
test("availability inventory matches every public source and excluded operation",()=>{
 const inventory=JSON.parse(readFileSync(new URL("../specs/availability.json",import.meta.url),"utf8"));
 assert.deepEqual([...inventory.publicServices].sort(),[...new Set(catalog.operations.map(o=>o.api))].sort());
 for(const api of inventory.apis){
  const ops=catalog.operations.filter(o=>o.api===api.api);
  assert.equal(ops.length,api.total);assert.equal(ops.filter(o=>o.availability.status==="supported").length,api.supported);
 }
 assert.deepEqual(inventory.unavailable.map(o=>o.operationId).sort(),catalog.operations.filter(o=>o.availability.status!=="supported").map(o=>o.operationId).sort());
});
test("multipart rejects arbitrary paths/URLs/base64, unsupported MIME and unknown input fields before store or credential reads",async()=>{
 for(const media of [
  {ref:"https://evil.example/a.png",mime:"image/png"},
  {ref:"/etc/passwd",mime:"image/png"},
  {ref:"inbound:../"+uuid+".png",mime:"image/png"},
  {ref:"inbound:%2e%2e.png",mime:"image/png"},
  {ref:"data:image/png;base64,AAAA",mime:"image/png"},
  {...upload.media,mime:"application/octet-stream"},
  {...upload.media,path:"/etc/passwd"},
  {...upload.media,bytes:"AAAA"},
 ]){
  let reads=0,credentials=0,calls=0;
  const r=await createTool("unifi_request_write",{}, {getRuntimeConfig(){credentials++;throw Error("must not access");}},{
   media:io({read:async()=>{reads++;throw Error("must not read");}}),fetch:async()=>{calls++;throw Error("must not send");}
  }).execute("bad", {...upload,media});
  assert.equal(r.isError,true);assert.equal(reads,0);assert.equal(credentials,0);assert.equal(calls,0);
 }
});
test("missing media and JSON replacement are rejected; read surface cannot upload",()=>{
 for(const args of [{...upload,media:undefined},{...upload,body:"binary"},{...upload,body:{file:"path"}}]){
  // Remove undefined so this exercises the media contract, not plain-JSON guard.
  const clean=JSON.parse(JSON.stringify(args));assert.throws(()=>prepareRequest(clean,true));
 }
 assert.throws(()=>prepareRequest(upload,false),/wrong_request_tool/);
 assert.throws(()=>prepareRequest({...snapshot,media:upload.media},false),/unexpected_media/);
});
test("unavailable, empty, oversize and MIME-spoofed upload store inputs never access credentials or fetch",async()=>{
 for(const read of [async()=>{throw Error("/PRIVATE");},async()=>({buffer:Buffer.alloc(0)}),async()=>({buffer:Buffer.alloc(MAX_MEDIA_BYTES+1)}),async()=>({buffer:Buffer.from("not an image")})]){
  let credentials=0,calls=0;
  const r=await createTool("unifi_request_write",{}, {getRuntimeConfig(){credentials++;throw Error("must not read");}},{
   media:io({read}),fetch:async()=>{calls++;throw Error("must not send");}
  }).execute("bad-file",upload);
  assert.equal(r.isError,true);assert.equal(credentials,0);assert.equal(calls,0);assert.equal(JSON.stringify(r).includes("/PRIVATE"),false);
 }
});
test("multipart transport failures preserve uncertain-write outcome without retries",async()=>{
 for(const response of [()=>{throw Error("uncertain");},()=>new Response("private upstream",{status:503}),()=>new Response("invalid-json")]){
  let calls=0;
  const r=await createTool("unifi_request_write",config,{}, {media:io(),fetch:async()=>{calls++;return response();}}).execute("uncertain",upload);
  assert.equal(r.isError,true);assert.equal(r.details.error.outcome,"unknown");assert.equal(calls,1);
 }
});
test("upload cancellation interrupts a stalled SDK read with no credential access or send",async()=>{
 const controller=new AbortController();let credentials=0,calls=0;
 const pending=createTool("unifi_request_write",{}, {getRuntimeConfig(){credentials++;throw Error("must not access");}},{media:io({read:async()=>new Promise(()=>{})}),fetch:async()=>{calls++;throw Error("must not fetch");}}).execute("cancel",upload,controller.signal);
 controller.abort();
 const r=await pending;assert.equal(r.details.error.code,"cancelled");assert.equal(credentials,0);assert.equal(calls,0);
});
test("subscription inventory is describeable but both native and generic execution fail before credentials",async()=>{
 for(const endpoint of ["devices","events"]){
  const id="protect:get:/v1/subscribe/"+endpoint;
  assert.equal(discover({api:"protect",search:"/subscribe/"+endpoint}).total,1);
  const d=describe(id);assert.equal(d.executable,false);assert.equal(d.availability.status,"upstream-unavailable");assert.ok(d.responses["200"]);assert.ok(Object.keys(d.components.schemas).length);
  const args={operationId:id,consoleId:"console"};
  let reads=0,calls=0;
  const r=await createTool("unifi_request",{}, {getRuntimeConfig(){reads++;throw Error("must not read");}},{fetch:async()=>{calls++;throw Error("must not send");}}).execute("excluded",args);
  assert.equal(r.details.error.code,"upstream_unavailable");assert.equal(reads,0);assert.equal(calls,0);
  assert.throws(()=>prepareRequest({operationId:"ConnectorGet",path:{id:"c",path:"protect/integration/v1/subscribe/"+endpoint}},false),/upstream_unavailable/);
 }
});
test("all 87 original IDs and routes remain; added source names cannot collide",()=>{
 const baseline=JSON.parse(readFileSync(new URL("./original-operations.json",import.meta.url),"utf8"));
 assert.equal(baseline.baseline,"f34eb7914ec0f5f59b2ecc1a8038b241021880f4");
 assert.equal(baseline.operations.length,87);
 for(const op of baseline.operations){const now=catalog.operations.find(o=>o.operationId===op.operationId);assert.equal(now.api,op.api);assert.equal(now.method,op.method);assert.equal(now.path,op.path);}
 assert.equal(describe("mobility:listDevices").sourceOperationId,"listDevices");
 assert.equal(describe("listDevices").api,"site-manager");
 assert.equal(catalog.operations.filter(o=>o.availability.status==="supported").length,184);
});
test("Protect explicit closed allOf wrappers accept inherited fields but reject extra and missing fields",()=>{
 const op=catalog.operations.find(o=>o.operationId==="protect:post:/v1/liveviews");
 const args=inputFor(op);assert.doesNotThrow(()=>prepareRequest(args,true));
 assert.throws(()=>prepareRequest({...args,body:{...args.body,unexpected:1}},true),/schema_validation/);
 const body={...args.body};delete body.name;assert.throws(()=>prepareRequest({...args,body},true),/schema_validation/);
 validateValue("site-manager",{allOf:[{type:"object",properties:{inherited:{type:"integer"}},required:["inherited"]}],additionalProperties:false},{inherited:3});
});
test("real SDK media save/read remains in isolated private store; traversal and symlink escape fail",()=>{
 const temporary=mkdtempSync(join(tmpdir(),"unifi-media-sdk-"));
 try{
  const script=`
   import {saveMediaBuffer,readMediaBuffer} from "openclaw/plugin-sdk/media-store";
   import {readFileSync,statSync,symlinkSync,writeFileSync} from "node:fs";
   import {dirname,join} from "node:path";
   const bytes=readFileSync("assets/icon.png");
   const saved=await saveMediaBuffer(bytes,"image/png","unifi",5242880);
   if(!saved.path.startsWith(process.env.OPENCLAW_STATE_DIR+"/media/unifi/"))throw Error("store escaped");
   if((statSync(dirname(saved.path)).mode&0o777)!==0o700)throw Error("directory not private");
   const read=await readMediaBuffer(saved.id,"unifi",5242880);
   if(!read.buffer.equals(bytes))throw Error("roundtrip mismatch");
   for(const id of ["../outside",saved.path]){let denied=false;try{await readMediaBuffer(id,"unifi",5242880);}catch{denied=true;}if(!denied)throw Error("unsafe id");}
   const outside=join(process.env.OPENCLAW_STATE_DIR,"outside");writeFileSync(outside,"private");
   const link="11111111-1111-4111-8111-111111111111.png";symlinkSync(outside,join(dirname(saved.path),link));
   let denied=false;try{await readMediaBuffer(link,"unifi",5242880);}catch{denied=true;}if(!denied)throw Error("symlink escape");
   console.log("isolated media store passed");process.exit(0);
  `;
  const output=execFileSync(process.execPath,["--input-type=module","-e",script],{cwd:new URL("../",import.meta.url),env:{...process.env,OPENCLAW_STATE_DIR:temporary},encoding:"utf8",timeout:10000});
  assert.match(output,/isolated media store passed/);
 }finally{rmSync(temporary,{recursive:true,force:true});}
});

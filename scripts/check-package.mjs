import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,readdirSync,symlinkSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=fileURLToPath(new URL("../",import.meta.url));
const temporary=mkdtempSync(join(tmpdir(),"openclaw-unifi-pack-"));
try{
 const packed=JSON.parse(execFileSync("npm",["pack","--ignore-scripts","--json","--pack-destination",temporary],{cwd:root,encoding:"utf8"}))[0];
 const files=new Set(packed.files.map(f=>f.path));
 const runtime=readdirSync(join(root,"dist")).filter(p=>p.endsWith(".js"));
 const required=["package.json","dist/doctor-contract-api.js","openclaw.plugin.json","README.md","API_INVENTORY.md","ARCHITECTURE.md","SECURITY.md","CONTRIBUTING.md","LICENSE","NOTICE","assets/icon.png","assets/icon.svg","assets/activity.svg","skills/unifi/SKILL.md","specs/catalog.json","specs/provenance.json","specs/site-manager-v1.0.0.json","specs/network-v10.6.106.json","specs/protect-v7.3.70.json","specs/innerspace-v1.3.23.json","specs/mobility-v1.0.0.json","specs/carrier-fabric-v1.0.0.json","specs/availability.json","third_party/unifi-mcp-server/LICENSE","third_party/unifi-mcp-server/client.ts","third_party/unifi-mcp-server/connector-client.ts",...runtime.map(p=>"dist/"+p)];
 for(const path of required)assert.ok(files.has(path),"packed artifact missing "+path);
 for(const path of files){
  assert.ok(!path.startsWith("node_modules/")&&!path.startsWith("test/")&&!path.startsWith(".git/"),"unintended file "+path);
  assert.ok(!/(^|\/)\.env($|\.)|openclaw\.json$|credentials?\.json$/i.test(path),"unexpected sensitive filename "+path);
 }
 const manifest=JSON.parse(readFileSync(join(root,"openclaw.plugin.json")));
 assert.ok(manifest.controlUi?.entry,"native UniFi UI entry required");
 assert.ok(files.has(manifest.controlUi.entry),"packed browser entry missing");
 // Only modules produced from current source and the active native UI belong
 // in dist. In particular, old hashed UI generations are not release resources.
 const expectedDist=new Set(readdirSync(join(root,"src")).filter(p=>p.endsWith(".ts")).flatMap(p=>{
  const stem=p.slice(0,-3);return ["dist/"+stem+".js","dist/"+stem+".js.map","dist/"+stem+".d.ts"];
 }));
 const uiRoot=manifest.controlUi.entry.slice(0,manifest.controlUi.entry.lastIndexOf("/")+1);
 assert.match(uiRoot,/^dist\/control-ui\/[a-f0-9]{64}\/$/,"unexpected UI build root");
 for(const path of files)if(path.startsWith("dist/")){
  assert.ok(expectedDist.has(path)||path.startsWith(uiRoot),"stale or unexpected packed build output "+path);
 }
 for(const path of expectedDist)assert.ok(files.has(path),"missing current runtime output "+path);
 const tarball=join(temporary,packed.filename);
 execFileSync("tar",["-xzf",tarball,"-C",temporary]);
 const extracted=join(temporary,"package");
 const pkg=JSON.parse(readFileSync(join(extracted,"package.json")));
 assert.equal(pkg.type,"module");assert.deepEqual(pkg.openclaw.extensions,["./dist/index.js"]);assert.equal(pkg.peerDependencies.openclaw,">=2026.10.7 <2026.11.0");
 assert.deepEqual(Object.keys(pkg.dependencies).sort(),["ajv","ajv-formats","typebox"]);
 assert.equal(readFileSync(join(extracted,"assets/icon.png")).subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 // A clean production dependency project: no source-tree node_modules lookup.
 execFileSync("npm",["install","--omit=dev","--ignore-scripts","--legacy-peer-deps","--package-lock=false","--no-audit","--no-fund"],{cwd:extracted,stdio:"pipe"});
 const host=import.meta.resolve("openclaw/plugin-sdk/plugin-entry");
 symlinkSync(fileURLToPath(new URL("../../",host)),join(extracted,"node_modules","openclaw"),"dir");
 const probe='const manifest=JSON.parse((await import("node:fs")).readFileSync("./openclaw.plugin.json","utf8"));const ui=(await import("./"+manifest.controlUi.entry)).default;let pages=0,navigation=0;const dispose=ui.activate({ui:{registerPage(p){if(p.id!=="setup")throw Error("bad page");pages++;return ()=>{};},registerNavigation(n){navigation++;return ()=>{};}}});if(ui.id!=="unifi"||pages!==1||navigation!==1)throw Error("bad packed UI");dispose();const entry=(await import("./dist/index.js")).default;const{catalog}=await import("./dist/catalog.js");const{createTool}=await import("./dist/tools.js");if(entry.id!=="unifi"||catalog.operations.length!==186)throw Error("bad runtime");const r=await createTool("unifi_status",{pluginConfig:{}},{}).execute("packed",{});if(r.details.configured!==false||r.details.operations!==186)throw Error("bad packed tool");const {describe}=await import("./dist/catalog.js"); for(const id of ["protect:get:/v1/cameras/{id}/snapshot","protect:post:/v1/files/{fileType}","innerspace:get:/v1/assets/{planId}/{filename}","mobility:listDevices","carrier-fabric:createSubscriber"]){if(!describe(id).executable)throw Error("missing packed application");} const {validateMediaInput}=await import("./dist/media.js"); validateMediaInput({ref:"inbound:11111111-1111-4111-8111-111111111111.png",mime:"image/png"});console.log("Packed runtime, all API resources and media SDK import succeeded");';
 const output=execFileSync(process.execPath,["--input-type=module","-e",probe],{cwd:extracted,encoding:"utf8"});
 const digest=createHash("sha256").update(readFileSync(tarball)).digest("hex");
 console.log(output.trim());
 console.log("Package content check: "+files.size+" files; "+runtime.length+" runtime ESM modules; SHA-256 "+digest);
}finally{rmSync(temporary,{recursive:true,force:true});}

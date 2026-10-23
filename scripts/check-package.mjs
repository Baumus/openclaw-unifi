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
 const required=["package.json","openclaw.plugin.json","README.md","ARCHITECTURE.md","SECURITY.md","CONTRIBUTING.md","LICENSE","NOTICE","assets/icon.png","assets/icon.svg","assets/activity.svg","skills/unifi/SKILL.md","specs/catalog.json","specs/provenance.json","specs/site-manager-v1.0.0.json","specs/network-v10.6.106.json","third_party/unifi-mcp-server/LICENSE","third_party/unifi-mcp-server/client.ts","third_party/unifi-mcp-server/connector-client.ts",...runtime.map(p=>"dist/"+p)];
 for(const path of required)assert.ok(files.has(path),"packed artifact missing "+path);
 for(const path of files){
  assert.ok(!path.startsWith("node_modules/")&&!path.startsWith("test/")&&!path.startsWith(".git/"),"unintended file "+path);
  assert.ok(!/(^|\/)\.env($|\.)|openclaw\.json$|credentials?\.json$/i.test(path),"unexpected sensitive filename "+path);
 }
 const tarball=join(temporary,packed.filename);
 execFileSync("tar",["-xzf",tarball,"-C",temporary]);
 const extracted=join(temporary,"package");
 const pkg=JSON.parse(readFileSync(join(extracted,"package.json")));
 assert.equal(pkg.type,"module");assert.deepEqual(pkg.openclaw.extensions,["./dist/index.js"]);assert.equal(pkg.peerDependencies.openclaw,"2026.10.5");
 assert.deepEqual(Object.keys(pkg.dependencies).sort(),["ajv","ajv-formats","typebox"]);
 assert.equal(readFileSync(join(extracted,"assets/icon.png")).subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 // A clean production dependency project: no source-tree node_modules lookup.
 execFileSync("npm",["install","--omit=dev","--ignore-scripts","--legacy-peer-deps","--package-lock=false","--no-audit","--no-fund"],{cwd:extracted,stdio:"pipe"});
 const host=import.meta.resolve("openclaw/plugin-sdk/plugin-entry");
 symlinkSync(fileURLToPath(new URL("../../",host)),join(extracted,"node_modules","openclaw"),"dir");
 const probe='const entry=(await import("./dist/index.js")).default;const{catalog}=await import("./dist/catalog.js");const{createTool}=await import("./dist/tools.js");if(entry.id!=="unifi"||catalog.operations.length!==87)throw Error("bad runtime");const r=await createTool("unifi_status",{pluginConfig:{}},{}).execute("packed",{});if(r.details.configured!==false||r.details.operations!==87)throw Error("bad packed tool");console.log("Packed runtime import and local status succeeded");';
 const output=execFileSync(process.execPath,["--input-type=module","-e",probe],{cwd:extracted,encoding:"utf8"});
 const digest=createHash("sha256").update(readFileSync(tarball)).digest("hex");
 console.log(output.trim());
 console.log("Package content check: "+files.size+" files; "+runtime.length+" runtime ESM modules; SHA-256 "+digest);
}finally{rmSync(temporary,{recursive:true,force:true});}

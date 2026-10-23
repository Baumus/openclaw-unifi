import {readFile, writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const root = new URL("../", import.meta.url);
const inputs = [
  {api:"site-manager",file:"site-manager-v1.0.0.json",url:"https://developer.ui.com/site-manager/v1.0.0/openapi.json"},
  {api:"network",file:"network-v10.6.106.json",url:"https://developer.ui.com/network/v10.6.106/openapi.json"},
];
const provenance = JSON.parse(await readFile(new URL("specs/provenance.json",root),"utf8"));
const operations = [], sources = [], ids = new Set();
for(const input of inputs){
  const bytes = await readFile(new URL("specs/"+input.file,root));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const record = provenance.find(x=>x.file===input.file);
  if(!record || record.sha256!==sha256 || record.url!==input.url) throw new Error("spec provenance mismatch: "+input.file);
  sources.push({...input,sha256,retrieved:record.retrieved});
  const spec = JSON.parse(bytes);
  function deref(value){
    if(!value?.$ref) return value;
    if(!value.$ref.startsWith("#/")) throw new Error("external ref forbidden");
    return deref(value.$ref.slice(2).split("/").reduce((v,k)=>v[k.replace(/~1/g,"/").replace(/~0/g,"~")],spec));
  }
  for(const [path,item0] of Object.entries(spec.paths)){
    const item = deref(item0);
    for(const method of ["get","post","put","patch","delete"]){
      const op = item[method]; if(!op) continue;
      if(!op.operationId || ids.has(op.operationId)) throw new Error("missing or duplicate operationId");
      ids.add(op.operationId);
      const parameters = new Map();
      for(const p0 of [...(item.parameters??[]),...(op.parameters??[])]){
        const p=deref(p0); if(!["path","query"].includes(p.in)) throw new Error("unsupported parameter location");
        parameters.set(p.in+":"+p.name,p);
      }
      const record={operationId:op.operationId,api:input.api,method:method.toUpperCase(),path,summary:op.summary,description:op.description,parameters:[...parameters.values()],requestBody:op.requestBody?deref(op.requestBody):undefined,responses:op.responses??{},tags:op.tags,security:op.security??spec.security,deprecated:op.deprecated};
      if(record.requestBody && Object.keys(record.requestBody.content).some(x=>x!=="application/json"))throw new Error("unsupported media type");
      operations.push(record);
    }
  }
}
operations.sort((a,b)=>a.operationId.localeCompare(b.operationId,"en"));
const output = JSON.stringify({version:1,sources,operations},null,2)+"\n";
const path = new URL("specs/catalog.json",root);
if(process.argv.includes("--check")){
  if(await readFile(path,"utf8")!==output)throw new Error("catalog stale; run npm run catalog:generate");
}else await writeFile(path,output);
console.log("Official operation catalog: "+operations.length+" operations; "+sources.map(x=>x.api).join(", "));

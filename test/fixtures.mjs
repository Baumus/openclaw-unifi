import {specs, sourceRef} from "../dist/catalog.js";
export const uuid="11111111-1111-4111-8111-111111111111";
/** Test data derived independently from the original OAS, not runtime normalized schemas. */
export function sample(api,schema={},depth=0){
 if(depth>24)throw new Error("fixture recursion");
 const nodes=[],seen=new Set();
 function collect(s){
  if(s.$ref){if(seen.has(s.$ref))return;seen.add(s.$ref);collect(sourceRef(api,s.$ref));return;}
  nodes.push(s);
  for(const child of s.allOf??[])collect(child);
 }
 collect(schema);
 const selector={};
 for(let i=0;i<nodes.length;i++){
  const d=nodes[i].discriminator;
  if(d?.mapping){const [tag,ref]=Object.entries(d.mapping)[0];selector[d.propertyName]=tag;collect({$ref:ref});}
 }
 for(const n of nodes){if(n.oneOf?.length)return sample(api,n.oneOf[0],depth+1);if(n.anyOf?.length)return sample(api,n.anyOf[0],depth+1);}
 const type=nodes.find(n=>n.type)?.type;
 const enumNode=nodes.find(n=>n.enum?.length);
 if(enumNode && type!=="object" && !nodes.some(n=>n.properties))return enumNode.enum[0];
 if(nodes.some(n=>n.properties) || type==="object"){
  const props=Object.assign({},...nodes.map(n=>n.properties??{}));
  const required=new Set(nodes.flatMap(n=>n.required??[]));
  const result={};
  for(const name of required)result[name]=sample(api,props[name]??{},depth+1);
  return {...result,...selector};
 }
 if(type==="array"){const node=nodes.find(n=>n.items)??{};return Array.from({length:Math.max(1,...nodes.map(n=>n.minItems??0))},()=>sample(api,node.items,depth+1));}
 if(type==="boolean")return true;
 if(type==="integer"||type==="number")return Math.max(1,...nodes.map(n=>n.minimum??0));
 const format=nodes.find(n=>n.format)?.format;
 if(format==="uuid")return uuid;
 if(format==="date-time")return "2026-10-23T12:00:00Z";
 if(format==="date")return "2026-10-23";
 return "x".repeat(Math.max(1,...nodes.map(n=>n.minLength??0)));
}
export function inputFor(op){
 const input={operationId:op.operationId};
 if(op.api==="network")input.consoleId="console:123";
 const path={},query={};
 for(const p of op.parameters){
  if(p.in==="path")path[p.name]=p.name==="path"?"network/integration/v1/sites":sample(op.api,p.schema);
  if(p.in==="query"&&p.required)query[p.name]=sample(op.api,p.schema);
 }
 if(Object.keys(path).length)input.path=path;
 if(Object.keys(query).length)input.query=query;
 if(op.requestBody)input.body=sample(op.api,op.requestBody.content["application/json"].schema??{});
 return input;
}

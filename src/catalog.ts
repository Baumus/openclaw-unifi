import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Catalog, Operation, JsonSchema, Api } from "./types.js";
import { fail } from "./errors.js";

export const catalog: Catalog = JSON.parse(readFileSync(new URL("../specs/catalog.json", import.meta.url), "utf8"));
export const catalogDigest = createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
export const specs: Record<string, JsonSchema> = Object.fromEntries(catalog.sources.map(source => {
  const bytes = readFileSync(new URL("../specs/" + source.file, import.meta.url));
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) fail("spec_integrity");
  return [source.api, JSON.parse(bytes.toString("utf8"))];
}));
export const apis = catalog.sources.map(source => source.api as Api);
export const isConsoleApi = (api: string) => ["network","protect","innerspace"].includes(api);
const byId = new Map(catalog.operations.map(op => [op.operationId, op]));
export function operation(id: unknown): Operation {
  if (typeof id !== "string" || !byId.has(id)) fail("unknown_operation");
  return byId.get(id)!;
}
export function sourceRef(api: string, ref: string): JsonSchema {
  if (!ref.startsWith("#/")) fail("external_schema_reference");
  const value = ref.slice(2).split("/").reduce((v: any, key) => v?.[decodeURIComponent(key).replace(/~1/g, "/").replace(/~0/g, "~")], specs[api]);
  if (!value || typeof value !== "object") fail("invalid_schema_reference");
  return value;
}
/** Every local ref is included once; recursive schemas remain recursive, not truncated. */
export function describe(id: unknown) {
  const op = operation(id);
  const components: JsonSchema = {};
  const seen = new Set<string>();
  function walk(value: unknown): void {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string" && !seen.has(child)) {
        seen.add(child);
        const schema = sourceRef(op.api, child);
        const name = decodeURIComponent(child.slice("#/components/schemas/".length)).replace(/~1/g, "/").replace(/~0/g, "~");
        components[name] = schema;
        walk(schema);
      } else if (key === "mapping" && child && typeof child === "object") {
        for (const target of Object.values(child)) if (typeof target === "string") walk({ $ref: target });
      } else walk(child);
    }
  }
  walk(op);
  return {
    ...op,
    tool: op.method === "GET" ? "unifi_request" : "unifi_request_write",
    sideEffecting: op.method !== "GET",
    replaySafe: op.method === "GET",
    transport: op.transport,
    executable: op.availability.status === "supported",
    requestSchema: {
      type: "object", additionalProperties: false, required: ["operationId", ...(isConsoleApi(op.api) ? ["consoleId"] : []), ...(op.parameters.some(p => p.in === "path" && p.required) ? ["path"] : []), ...(op.parameters.some(p => p.in === "query" && p.required) ? ["query"] : []), ...(op.requestBody?.content["multipart/form-data"] ? ["media"] : op.requestBody?.required ? ["body"] : [])],
      properties: {
        operationId: { const: op.operationId },
        ...(isConsoleApi(op.api) ? { consoleId: { type: "string", description: "Console ID from Site Manager. Not Network site UUID." } } : {}),
        path: { type: "object", properties: Object.fromEntries(op.parameters.filter(p => p.in === "path").map(p => [p.name, p.schema ?? {}])), required: op.parameters.filter(p => p.in === "path" && p.required).map(p => p.name), additionalProperties: false },
        query: { type: "object", properties: Object.fromEntries(op.parameters.filter(p => p.in === "query").map(p => [p.name, p.schema ?? {}])), required: op.parameters.filter(p => p.in === "query" && p.required).map(p => p.name), additionalProperties: op.path.endsWith("/*path") },
        ...(op.requestBody?.content["multipart/form-data"] ? {media: {type:"object",required:["ref","mime"],additionalProperties:false,properties:{ref:{type:"string",description:"Governed inbound:<store-id> or unifi:<store-id>. No path or URL."},mime:{enum:["image/gif","image/jpeg","image/png","audio/mpeg","audio/mp4","audio/wave","audio/x-caf"]}}}} : op.requestBody || (op.path.endsWith("/*path") && op.method === "DELETE") ? {body: op.requestBody?.content["application/json"]?.schema ?? {}} : {}),
      },
      components: { schemas: components },
    },
    components: { schemas: components },
    connector: op.path.endsWith("/*path") ? {
      pathInput: "path.path: application-relative path, e.g. network/integration/v1/sites (no /proxy prefix, query, URL, or encoding).",
      query: "Additional query keys are forwarded using OpenAPI form serialization (arrays repeat the key); no headers can be overridden.",
      validation: "Generic forwarding validates the envelope, not an application's endpoint schema. DELETE can forward an optional JSON body as a documented plugin extension.",
    } : undefined,
    sources: catalog.sources.filter(s => s.api === op.api),
  };
}
type DiscoverInput = { search?: string; api?: Api; method?: string; cursor?: string; limit?: number };
export function discover(input: DiscoverInput = {}) {
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (input.search?.length ?? 0) > 256) fail("invalid_discovery");
  if (input.api && !apis.includes(input.api)) fail("invalid_discovery");
  if (input.method && !["GET","POST","PUT","PATCH","DELETE"].includes(input.method)) fail("invalid_discovery");
  const search = (input.search ?? "").toLowerCase();
  const binding = createHash("sha256").update(JSON.stringify([catalogDigest, search, input.api, input.method])).digest("hex");
  let offset = 0;
  if (input.cursor) {
    try {
      if (input.cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) fail("invalid_cursor");
      const cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (cursor.binding !== binding || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) fail("invalid_cursor");
      offset = cursor.offset;
    } catch { fail("invalid_cursor"); }
  }
  const matches = catalog.operations.filter(op => (!input.api || op.api === input.api) && (!input.method || op.method === input.method) && [op.operationId, op.path, op.summary, op.tags?.join(" ")].join(" ").toLowerCase().includes(search));
  if (offset > matches.length) fail("invalid_cursor");
  const items = matches.slice(offset, offset + limit).map(op => ({ operationId: op.operationId, api: op.api, method: op.method, path: op.path, summary: op.summary, availability: op.availability, tool: op.method === "GET" ? "unifi_request" : "unifi_request_write" }));
  const next = offset + items.length;
  return { total: matches.length, operations: items, ...(next < matches.length ? { cursor: Buffer.from(JSON.stringify({ binding, offset: next })).toString("base64url") } : {}) };
}

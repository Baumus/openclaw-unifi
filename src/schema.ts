import { Ajv, type ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import { specs } from "./catalog.js";
import type { JsonSchema } from "./types.js";
import { fail } from "./errors.js";

const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: true, coerceTypes: false, useDefaults: false, removeAdditional: false, ownProperties: true });
const addFormats = addFormatsModule as unknown as (ajv: Ajv) => void;
addFormats(ajv);
ajv.addFormat("int32", { type: "number", validate: (n: number) => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647 });
ajv.addFormat("int64", { type: "number", validate: (n: number) => Number.isSafeInteger(n) });
ajv.addFormat("double", { type: "number", validate: Number.isFinite });
const pointer = (s: string) => encodeURIComponent(s.replace(/~/g, "~0").replace(/\//g, "~1"));
const cache = new Map<string, ValidateFunction>();
const normalized = new Map<string, JsonSchema>();
/**
 * OAS discriminator mappings do not imply oneOf in JSON Schema. Expand dispatch
 * explicitly; derived allOf parents reference a non-dispatching base to avoid
 * recursion. Preserve all properties and open-object semantics across allOf.
 */
export function normalizeSchema(api: string, schema: JsonSchema, owner?: string, base = false): JsonSchema {
  if (typeof schema === "boolean") return schema;
  const out: JsonSchema = { ...schema };
  delete out.discriminator;
  if (schema.$ref) {
    const prefix = "#/components/schemas/";
    if (!schema.$ref.startsWith(prefix)) fail("external_schema_reference");
    const name = decodeURIComponent(schema.$ref.slice(prefix.length)).replace(/~1/g, "/").replace(/~0/g, "~");
    const parent = specs[api]!.components?.schemas?.[name];
    if (!parent) fail("invalid_schema_reference");
    const isInheritedBase = !!owner && Object.values(parent.discriminator?.mapping ?? {}).some(ref => ref === prefix + owner);
    out.$ref = "#/definitions/" + pointer(name + (isInheritedBase ? "__base" : ""));
  }
  // Protect emits closed allOf request wrappers without property declarations.
  // Project inherited names onto that closure; constraints remain in allOf.
  // This is explicit OAS inheritance normalization, never implicit closure.
  if (schema.additionalProperties === false && schema.allOf) {
    const names = new Set<string>(), seen = new Set<string>();
    function collect(node: JsonSchema) {
      if (node.$ref && !seen.has(node.$ref)) {
        seen.add(node.$ref);
        const name = node.$ref.slice("#/components/schemas/".length).replace(/~1/g,"/").replace(/~0/g,"~");
        const target = specs[api]?.components?.schemas?.[name];
        if (target) collect(target);
      }
      for (const name of Object.keys(node.properties ?? {})) names.add(name);
      for (const child of node.allOf ?? []) collect(child);
    }
    collect(schema);
    out.properties = Object.fromEntries([...names].map(name => [name, {}]));
  }
  if (schema.properties) out.properties = {...out.properties, ...Object.fromEntries(Object.entries(schema.properties).map(([key,value]) => [key, normalizeSchema(api, value as JsonSchema)]))};
  for (const key of ["items", "additionalProperties", "not"]) if (schema[key] && typeof schema[key] === "object") out[key] = normalizeSchema(api, schema[key]);
  for (const key of ["allOf", "anyOf", "oneOf"]) if (schema[key]) out[key] = schema[key].map((s: JsonSchema) => normalizeSchema(api, s, key === "allOf" ? owner : undefined));
  if (!base && schema.discriminator?.mapping) {
    const property = schema.discriminator.propertyName;
    const variants = Object.entries(schema.discriminator.mapping).map(([tag, ref]) => ({
      allOf: [normalizeSchema(api, { $ref: ref }), { type: "object", required: [property], properties: { [property]: { const: tag } } }],
    }));
    out.allOf = [...(out.allOf ?? []), { oneOf: variants }];
  }
  if (schema.nullable) { delete out.nullable; return { anyOf: [out, { type: "null" }] }; }
  return out;
}
function definitions(api: string): JsonSchema {
  if (!normalized.has(api)) {
    const defs: JsonSchema = {};
    for (const [name, value] of Object.entries(specs[api]!.components?.schemas ?? {})) {
      defs[name] = normalizeSchema(api, value as JsonSchema, name);
      if ((value as JsonSchema).discriminator) defs[name + "__base"] = normalizeSchema(api, value as JsonSchema, name, true);
    }
    normalized.set(api, defs);
  }
  return normalized.get(api)!;
}
export function validateValue(api: string, schema: JsonSchema, value: unknown): void {
  const key = api + JSON.stringify(schema);
  let validate = cache.get(key);
  if (!validate) {
    validate = ajv.compile({ ...normalizeSchema(api, schema), definitions: definitions(api) });
    cache.set(key, validate);
  }
  // No provider-controlled text, values or schema paths are exposed in errors.
  if (!validate(value)) fail("schema_validation");
}
export function validatePlainJson(value: unknown, maxBytes = 1024 * 1024): string {
  let count = 0;
  const ancestors = new Set<object>();
  function visit(v: unknown, depth: number): void {
    if (++count > 100_000 || depth > 48) fail("request_too_complex");
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number" && Number.isFinite(v)) return;
    if (!v || typeof v !== "object" || ancestors.has(v)) fail("invalid_json");
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) fail("invalid_json");
    ancestors.add(v);
    for (const key of Object.keys(v)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) fail("invalid_json");
      const desc = Object.getOwnPropertyDescriptor(v, key);
      if (!desc || !("value" in desc)) fail("invalid_json");
      visit(desc.value, depth + 1);
    }
    ancestors.delete(v);
  }
  visit(value, 0);
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > maxBytes) fail("request_too_large");
  return json;
}

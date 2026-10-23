import { operation } from "./catalog.js";
import { fail } from "./errors.js";
import { validatePlainJson, validateValue } from "./schema.js";
import type { Parameter, RequestInput, RequestPlan } from "./types.js";

export const API_ORIGIN = "https://api.ui.com";
/** Percent is forbidden: no double-encoding, encoded traversal or encoded separators. */
export function safeSegment(value: unknown): string {
  if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "number" && !Number.isSafeInteger(value))) fail("invalid_path");
  const text = String(value);
  if (!text || text.length > 512 || /[\\/%?#\x00-\x20\x7f]/.test(text) || text === "." || text === "..") fail("invalid_path");
  return encodeURIComponent(text);
}
export function connectorPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096 || value.startsWith("//")) fail("invalid_connector_path");
  let text = value.startsWith("/") ? value.slice(1) : value;
  if (text.startsWith("proxy/")) text = text.slice(6);
  const parts = text.split("/");
  if (parts.length < 2 || parts.some(s => !/^[A-Za-z0-9._~-]+$/.test(s) || s === "." || s === "..")) fail("invalid_connector_path");
  return "proxy/" + parts.map(safeSegment).join("/");
}
function scalar(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value === null ? "" : String(value);
  fail("invalid_query_serialization");
}
export function appendQuery(url: URL, p: Parameter, value: unknown): void {
  if (value === undefined) return;
  if (p.content?.["application/json"]) { url.searchParams.append(p.name, JSON.stringify(value)); return; }
  const style = p.style ?? "form", explode = p.explode ?? (style === "form");
  if (style === "deepObject") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_query_serialization");
    for (const [key, item] of Object.entries(value)) url.searchParams.append(p.name + "[" + key + "]", scalar(item));
    return;
  }
  if (!["form","spaceDelimited","pipeDelimited"].includes(style)) fail("unsupported_query_style");
  if (Array.isArray(value)) {
    const values = value.map(scalar);
    if (style === "form" && explode) for (const item of values) url.searchParams.append(p.name, item);
    else url.searchParams.append(p.name, values.join(style === "spaceDelimited" ? " " : style === "pipeDelimited" ? "|" : ","));
  } else if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (style !== "form") fail("invalid_query_serialization");
    if (explode) for (const [key, item] of entries) url.searchParams.append(key, scalar(item));
    else url.searchParams.append(p.name, entries.flatMap(([key, item]) => [key, scalar(item)]).join(","));
  } else url.searchParams.append(p.name, scalar(value));
}
/** Pure planning: invalid requests fail before runtime credentials or network. */
export function prepareRequest(input: RequestInput, write: boolean): RequestPlan {
  validatePlainJson(input);
  if (Object.keys(input).some(k => !["operationId","consoleId","path","query","body"].includes(k))) fail("unknown_request_field");
  const op = operation(input.operationId);
  if ((op.method !== "GET") !== write) fail("wrong_request_tool");
  const wildcard = op.path.endsWith("/*path");
  if (op.api !== "network" && input.consoleId !== undefined) fail("irrelevant_console_id");
  const path = input.path ?? {}, query = input.query ?? {};
  if (!path || typeof path !== "object" || Array.isArray(path) || !query || typeof query !== "object" || Array.isArray(query)) fail("invalid_parameters");
  const pathParams = op.parameters.filter(p => p.in === "path"), queryParams = op.parameters.filter(p => p.in === "query");
  if (Object.keys(path).some(key => !pathParams.some(p => p.name === key))) fail("unknown_path_parameter");
  if (!wildcard && Object.keys(query).some(key => !queryParams.some(p => p.name === key))) fail("unknown_query_parameter");
  for (const p of op.parameters) {
    const values = p.in === "path" ? path : query;
    if (!(p.name in values)) { if (p.required) fail("missing_parameter"); continue; }
    validateValue(op.api, p.schema ?? p.content?.["application/json"]?.schema ?? {}, values[p.name]);
  }
  let relative = op.path.replace(/\{([^}]+)\}/g, (_, key: string) => safeSegment(path[key]));
  if (wildcard) relative = relative.replace("*path", connectorPath(path.path));
  const prefix = op.api === "network" ? "/v1/connector/consoles/" + safeSegment(input.consoleId) + "/proxy/network/integration" : "";
  const url = new URL(API_ORIGIN + prefix + relative);
  for (const [key, value] of Object.entries(query)) {
    if (key.length > 256) fail("invalid_query");
    appendQuery(url, queryParams.find(p => p.name === key) ?? { name: key, in: "query" }, value);
  }
  if (url.href.length > 32768) fail("request_url_too_large");
  let body: string | undefined;
  if (input.body !== undefined) {
    // Connector DELETE has no requestBody in the snapshot. Permit JSON forwarding
    // as an explicit extension; all other operations follow their declared schema.
    if (!op.requestBody && !(wildcard && op.method === "DELETE")) fail("unexpected_body");
    validateValue(op.api, op.requestBody?.content["application/json"]?.schema ?? {}, input.body);
    body = validatePlainJson(input.body);
  } else if (op.requestBody?.required) fail("missing_body");
  if (url.origin !== API_ORIGIN || url.username || url.password || url.hash) fail("invalid_destination");
  return { operationId: op.operationId, method: op.method, url, body };
}

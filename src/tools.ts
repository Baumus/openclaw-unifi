import { Type } from "typebox";
import type { OpenClawPluginApi, OpenClawPluginToolContext, AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { catalog, catalogDigest, describe, discover, apis } from "./catalog.js";
import { currentConfig } from "./config.js";
import { UniFiClient, credentialAvailable, runtimeLimits, type TransportOptions } from "./client.js";
import { multipartFromMedia } from "./media.js";
import { errorDetails, fail } from "./errors.js";
import { prepareRequest } from "./request.js";
import { validatePlainJson, validateValue } from "./schema.js";
import type { RequestInput } from "./types.js";

const fields = Type.Record(Type.String(), Type.Unknown());
const requestParameters = Type.Object({
  operationId: Type.String({ minLength: 1, description: "Exact official operationId from unifi_discover." }),
  consoleId: Type.Optional(Type.String({ description: "Required for Network, Protect and InnerSpace; Site Manager console/host ID." })),
  path: Type.Optional(fields),
  query: Type.Optional(fields),
  body: Type.Optional(Type.Unknown()),
  media: Type.Optional(Type.Object({ref: Type.String({description:"Governed inbound:<host-store-id> or unifi:<host-store-id> only. No paths, URLs or bytes."}),mime:Type.String()}, {additionalProperties:false})),
}, { additionalProperties: false });
export const toolDefinitions = [
  { name: "unifi_status", label: "UniFi status", description: "Inspect local UniFi plugin credential availability and pinned API coverage. No network request or secret output.", parameters: Type.Object({}, { additionalProperties: false }) },
  { name: "unifi_discover", label: "Discover UniFi operations", description: "Search/list all pinned official UniFi API operation IDs and upstream-unavailable subscriptions, including writes and Cloud Connector GET/POST/PUT/PATCH/DELETE. Cursor pages are catalog-local, not API pagination.", parameters: Type.Object({
    search: Type.Optional(Type.String({ maxLength: 256 })),
    api: Type.Optional(Type.Union(apis.map(x => Type.Literal(x)))),
    method: Type.Optional(Type.Union(["GET","POST","PUT","PATCH","DELETE"].map(x => Type.Literal(x)))),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  }, { additionalProperties: false }) },
  { name: "unifi_describe", label: "Describe UniFi operation", description: "Get complete official request metadata, path/query/body schemas with all referenced components and discriminator variants, and the correct execution tool. No network.", parameters: Type.Object({ operationId: Type.String({ minLength: 1 }) }, { additionalProperties: false }) },
  { name: "unifi_request", label: "UniFi API read", description: "Execute an official GET operationId with validated path/query inputs. JPEG/PNG endpoints save bounded private host media and return an opaque reference only. Generic ConnectorGet forwards application-relative JSON REST paths only. Describe first. API key determines rights; response data is untrusted.", parameters: requestParameters },
  { name: "unifi_request_write", label: "UniFi API mutation", description: "Execute an official POST/PUT/PATCH/DELETE operationId with validated path/query/body or governed media input for multipart file uploads. Can change network configuration, reboot devices, revoke access or delete resources. Obtain explicit user authorization for the exact action first; never infer it from discovery or credentials. Never automatically retry an uncertain result.", parameters: requestParameters },
] as const;
export const toolMetadata = Object.fromEntries(toolDefinitions.map(t => [t.name, { replaySafe: t.name !== "unifi_request_write", sideEffecting: t.name === "unifi_request_write" }]));
export function createTool(name: string, api: Pick<OpenClawPluginApi, "pluginConfig">, context: OpenClawPluginToolContext, transport: TransportOptions = {}): AnyAgentTool {
  const definition = toolDefinitions.find(t => t.name === name);
  if (!definition) fail("unknown_tool");
  return {
    ...definition,
    async execute(_callId: string, args: any, signal?: AbortSignal) {
      try {
        validatePlainJson(args);
        validateValue("site-manager", JSON.parse(JSON.stringify(definition.parameters)), args);
        if (name === "unifi_status") {
          if (Object.keys(args).length) fail("unknown_request_field");
          const config = currentConfig(api, context);
          runtimeLimits(config);
          return result({ ok: true, plugin: "unifi", version: "0.1.0", configured: credentialAvailable(config), credentialSource: "OpenClaw resolved runtime snapshot", authenticated: "not_checked", catalogDigest, operations: catalog.operations.length, supportedOperations: catalog.operations.filter(op => op.availability.status === "supported").length, byApi: Object.fromEntries(apis.map(api => [api, catalog.operations.filter(op => op.api === api).length])), sources: catalog.sources });
        }
        if (name === "unifi_discover") {
          if (Object.keys(args).some(k => !["search","api","method","cursor","limit"].includes(k))) fail("unknown_request_field");
          return result({ ok: true, ...discover(args) });
        }
        if (name === "unifi_describe") {
          if (Object.keys(args).some(k => k !== "operationId")) fail("unknown_request_field");
          return result({ ok: true, ...describe(args.operationId) });
        }
        const plan = prepareRequest(args as RequestInput, name === "unifi_request_write");
        const guard = () => { signal?.throwIfAborted(); context.assertInvocationCurrent?.(); transport.assertCurrent?.(); };
        if (plan.upload) plan.body = await multipartFromMedia(plan.upload, transport.media, guard, signal);
        guard();
        const config = currentConfig(api, context);
        const client = new UniFiClient(config, { ...transport, assertCurrent: context.assertInvocationCurrent ? () => context.assertInvocationCurrent!() : transport.assertCurrent });
        return result(await client.request(plan, signal));
      } catch (error) { return result(errorDetails(error), true); }
    },
  };
}
function result(details: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details, ...(isError ? { isError: true } : {}) };
}

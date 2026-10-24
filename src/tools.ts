import type { OpenClawPluginApi, OpenClawPluginToolContext, AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { catalog, catalogDigest, describe, discover, apis } from "./catalog.js";
import { currentConfig } from "./config.js";
import { UniFiClient, credentialAvailable, runtimeLimits, type TransportOptions } from "./client.js";
import { errorDetails, fail } from "./errors.js";
import { prepareRequest } from "./request.js";
import { validatePlainJson, validateValue } from "./schema.js";
import { captureCredential } from "./credential.js";
import { PLUGIN_VERSION } from "./version.js";
import { toolDefinitions } from "./definitions.js";
export { toolDefinitions, toolMetadata } from "./definitions.js";
import type { RequestInput } from "./types.js";

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
          const { config } = await captureCredential(currentConfig(api, context));
          runtimeLimits(config);
          return result({ ok: true, plugin: "unifi", version: PLUGIN_VERSION, configured: credentialAvailable(config), credentialSource: "OpenClaw resolved runtime snapshot", authenticated: "not_checked", catalogDigest, operations: catalog.operations.length, supportedOperations: catalog.operations.filter(op => op.availability.status === "supported").length, byApi: Object.fromEntries(apis.map(api => [api, catalog.operations.filter(op => op.api === api).length])), sources: catalog.sources });
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
        const guard = () => { if (signal?.aborted) fail("cancelled"); context.assertInvocationCurrent?.(); transport.assertCurrent?.(); };
        if (plan.upload) {
          const { multipartFromMedia } = await import("./media.js");
          guard();
          plan.body = await multipartFromMedia(plan.upload, transport.media, guard, signal);
        }
        guard();
        const credential = await captureCredential(currentConfig(api, context));
        const assertCurrent = () => { guard(); if (!credential.isCurrent()) fail("configuration_not_active"); };
        assertCurrent();
        const client = new UniFiClient(credential.config, { ...transport, assertCurrent });
        return result(await client.request(plan, signal));
      } catch (error) { return result(errorDetails(error), true); }
    },
  };
}
function result(details: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details, ...(isError ? { isError: true } : {}) };
}

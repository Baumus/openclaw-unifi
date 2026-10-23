import { definePluginEntry, buildJsonPluginConfigSchema } from "openclaw/plugin-sdk/plugin-entry";
import { toolPluginMetadataSymbol, type ToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import { ConfigSchema } from "./config.js";
import { createTool, toolDefinitions } from "./tools.js";

const identity = { id: "unifi", name: "UniFi", description: "Community tools for the official UniFi Site Manager and Network APIs, including Cloud Connector forwarding." };
const configJson: Record<string, unknown> = JSON.parse(JSON.stringify(ConfigSchema));
const entry = definePluginEntry({
  ...identity,
  configSchema: buildJsonPluginConfigSchema(configJson),
  register(api) {
    for (const tool of toolDefinitions) api.registerTool(context => createTool(tool.name, api, context), { name: tool.name });
  },
});
// The focused SDK exports this static-metadata contract for official build/validate.
// Direct definePluginEntry registration keeps runtime snapshots late-bound per call.
const metadata: ToolPluginMetadata = {
  ...identity, activation: { onStartup: true }, configSchema: configJson,
  tools: toolDefinitions.map(tool => ({ ...tool, parameters: JSON.parse(JSON.stringify(tool.parameters)) })),
};
Object.defineProperty(entry, toolPluginMetadataSymbol, { value: metadata, enumerable: false });
export default entry;

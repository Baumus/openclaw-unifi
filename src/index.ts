import { definePluginEntry, buildJsonPluginConfigSchema } from "openclaw/plugin-sdk/plugin-entry";
import { toolPluginMetadataSymbol, type ToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import { registerSetup } from "./setup.js";
import { ConfigSchema } from "./config.js";
import { toolDefinitions } from "./definitions.js";

const identity = { id: "unifi", name: "UniFi", description: "Community tools for the official public UniFi APIs, including Cloud Connector and governed media." };
const configJson: Record<string, unknown> = JSON.parse(JSON.stringify(ConfigSchema));
const entry = definePluginEntry({
  ...identity,
  configSchema: buildJsonPluginConfigSchema(configJson),
  register(api) {
    // Every config field is read from the committed runtime at invocation time.
    // Rotating a token must not replace this registration or drain agent turns.
    api.registerReload({ noopPrefixes: ["plugins.entries.unifi.config"] });
    registerSetup(api);
    for (const tool of toolDefinitions) api.registerTool(context => ({
      ...tool,
      async execute(...args) {
        const { createTool } = await import("./tools.js");
        return createTool(tool.name, api, context).execute(...args);
      },
    }), { name: tool.name });
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

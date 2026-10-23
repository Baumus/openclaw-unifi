import { Type } from "typebox";
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import type { RuntimeConfig } from "./types.js";

export const ConfigSchema = Type.Object({
  apiKey: Type.Optional(Type.Object({
    source: Type.Union([Type.Literal("store"), Type.Literal("env"), Type.Literal("file"), Type.Literal("exec")]),
    provider: Type.String({ pattern: "^[a-z][a-z0-9_-]{0,63}$" }),
    id: Type.String({ minLength: 1, maxLength: 1024 }),
  }, { additionalProperties: false, description: "OpenClaw SecretRef only. Store the key through Settings → Secrets, then select its reference. Never paste a plaintext key here." })),
  requestTimeoutMs: Type.Optional(Type.Integer({ minimum: 100, maximum: 120000, default: 30000, description: "Whole request deadline, including response reading." })),
  maxResponseBytes: Type.Optional(Type.Integer({ minimum: 1024, maximum: 10485760, default: 10485760, description: "Bounded JSON response bytes; Cloud Connector upstream also limits responses to 10 MB." })),
}, { additionalProperties: false });
/** Never read raw api.config, environment, disk credentials, or resolve a ref ourselves. */
export function currentConfig(api: Pick<OpenClawPluginApi, "pluginConfig">, context: OpenClawPluginToolContext): RuntimeConfig {
  if (context.getRuntimeConfig) return context.getRuntimeConfig()?.plugins?.entries?.unifi?.config ?? {};
  if (context.runtimeConfig) return context.runtimeConfig.plugins?.entries?.unifi?.config ?? {};
  return api.pluginConfig ?? {};
}

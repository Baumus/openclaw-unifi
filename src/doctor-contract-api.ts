import { Ajv } from "ajv";
import { ConfigSchema } from "./config.js";

const validate = new Ajv({ strict: false, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(JSON.stringify(ConfigSchema)));

/** Inspect retained settings without resolving credentials, IO, or rewriting config. */
export function normalizeCompatibilityConfig({ cfg }: { cfg: unknown }) {
  const root = cfg as { plugins?: { entries?: { unifi?: { config?: unknown } } } };
  const retained = root?.plugins?.entries?.unifi?.config;
  return {
    config: cfg,
    changes: [] as string[],
    ...retained !== undefined && !validate(retained) ? { warnings: ["UniFi retained configuration does not match its SecretRef-only schema. Settings were preserved; repair the UniFi configuration before upgrading."] } : {},
  };
}

// UniFi owns no legacy durable state; the host manages its protected credentials.
export const stateMigrations = [];

import type { getRuntimeConfigSourceSnapshot } from 'openclaw/plugin-sdk/runtime-config-snapshot';
import { captureCredential, type PreparedReader } from './credential.js';
import { PLUGIN_VERSION } from './version.js';
import { API_ORIGIN } from './constants.js';
import { isSetupRef, sameRef } from './onboarding.js';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { UniFiClient, credentialAvailable, runtimeLimits, type TransportOptions } from './client.js';
import { errorDetails } from './errors.js';
import type { RuntimeConfig } from './types.js';
import type { ConnectionResult } from './onboarding.js';

export async function checkConnection(config: RuntimeConfig, transport: TransportOptions = {}): Promise<ConnectionResult> {
  if (!credentialAvailable(config)) return { configured: false, connected: false, code: 'credential_unavailable' };
  try {
    // Probe one site, not the default full page; agent requests keep their own deadline.
    const timeoutMs = Math.min(runtimeLimits(config).timeoutMs, 8_000);
    const response = await new UniFiClient({ ...config, requestTimeoutMs: timeoutMs }, transport).request({
      operationId: 'listSites', method: 'GET', url: new URL('/v1/sites?pageSize=1', API_ORIGIN),
    });
    const data = response.data as { data?: unknown[] } | null;
    // A 2xx non-list response is not proof that Site Manager access works.
    if (!data || !Array.isArray(data.data)) return { configured: true, connected: false, code: 'unexpected_response' };
    return { configured: true, connected: true, sites: data.data.length };
  } catch (error) {
    const safe = errorDetails(error).error;
    return { configured: true, connected: false, code: safe.code, ...(safe.status !== undefined ? { status: safe.status } : {}) };
  }
}
export function registerSetup(api: OpenClawPluginApi, sourceReader?: typeof getRuntimeConfigSourceSnapshot, preparedReader?: PreparedReader) {
  // Coalesce concurrent browser checks for this exact resolved snapshot only.
  // Never cache a result or share a check across token rotations.
  const inFlight = new WeakMap<RuntimeConfig, { revision?: number; promise: Promise<ConnectionResult> }>();
  const emptyConfig: RuntimeConfig = Object.freeze({});
  for (const network of [false, true]) {
    api.registerGatewayMethod(network ? 'unifi.connection.check' : 'unifi.connection.status', async ({ params, respond }) => {
      if (!params || Object.keys(params).some(k => k !== 'expectedRef') || (params.expectedRef !== undefined && !isSetupRef(params.expectedRef))) { respond(false, undefined, { code: 'INVALID_REQUEST', message: 'Expected empty parameters' }); return; }
      try {
        // The snapshot SDK carries host config machinery. Load it only for a
        // submitted-reference check, not during registration or local status.
        const readSource = sourceReader ?? (params.expectedRef ? (await import('openclaw/plugin-sdk/runtime-config-snapshot')).getRuntimeConfigSourceSnapshot : undefined);
        const readConfig = (): RuntimeConfig => api.runtime.config.current().plugins?.entries?.unifi?.config ?? emptyConfig;
        const config = readConfig();
        const expected = params.expectedRef;
        const credential = await captureCredential(config, preparedReader);
        // A source-only canonicalization may advance refs without replacing resolved
        // bytes. The unique generation marker MUST be in the same runtime object
        // as the credential. Missing/old markers fail closed before any GET.
        const matches = () => readConfig() === config && credential.isCurrent() && (!expected || (config.setupBinding === expected.id && sameRef(readSource?.()?.plugins?.entries?.unifi?.config?.apiKey, expected)));
        if (!network) {
          const source = expected ? readSource?.()?.plugins?.entries?.unifi?.config : undefined;
          respond(true, { version: PLUGIN_VERSION, configured: credentialAvailable(credential.config), connected: false,
            ...(expected ? { sourceMatches: sameRef(source?.apiKey, expected) && source?.setupBinding === expected.id } : {}),
          }); return;
        }
        if (!matches()) { respond(true, { configured: credentialAvailable(credential.config), connected: false, code: 'configuration_not_active' }); return; }
        let result: ConnectionResult = { configured: credentialAvailable(credential.config), connected: false };
        if (network) {
          let pending = inFlight.get(config);
          if (!pending || pending.revision !== credential.revision) {
            const promise = checkConnection(credential.config, { assertCurrent() { if (!matches()) throw new Error('configuration_not_active'); } });
            pending = { revision: credential.revision, promise };
            inFlight.set(config, pending);
            const captured = pending;
            void promise.finally(() => { if (inFlight.get(config) === captured) inFlight.delete(config); }).catch(() => {});
          }
          result = await pending.promise;
        }
        if (!matches()) { respond(true, { configured: credentialAvailable(credential.config), connected: false, code: 'configuration_not_active' }); return; }
        respond(true, result);
      } catch { respond(false, undefined, { code: 'UNAVAILABLE', message: 'UniFi connection check unavailable' }); }
    }, { scope: 'operator.read' });
  }
}

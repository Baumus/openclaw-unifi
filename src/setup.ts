import { getRuntimeConfigSourceSnapshot } from 'openclaw/plugin-sdk/runtime-config-snapshot';
import { isSetupRef, sameRef } from './onboarding.js';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { UniFiClient, credentialAvailable, type TransportOptions } from './client.js';
import { prepareRequest } from './request.js';
import { errorDetails } from './errors.js';
import type { RuntimeConfig } from './types.js';
import type { ConnectionResult } from './onboarding.js';

export async function checkConnection(config: RuntimeConfig, transport: TransportOptions = {}): Promise<ConnectionResult> {
  if (!credentialAvailable(config)) return { configured: false, connected: false, code: 'credential_unavailable' };
  try {
    const response = await new UniFiClient(config, transport).request(prepareRequest({ operationId: 'listSites' }, false));
    const data = response.data as { data?: unknown[] } | null;
    // A 2xx non-list response is not proof that Site Manager access works.
    if (!data || !Array.isArray(data.data)) return { configured: true, connected: false, code: 'unexpected_response' };
    return { configured: true, connected: true, sites: data.data.length };
  } catch (error) {
    const safe = errorDetails(error).error;
    return { configured: true, connected: false, code: safe.code, ...(safe.status !== undefined ? { status: safe.status } : {}) };
  }
}
export function registerSetup(api: OpenClawPluginApi, sourceReader = getRuntimeConfigSourceSnapshot) {
  for (const network of [false, true]) {
    api.registerGatewayMethod(network ? 'unifi.connection.check' : 'unifi.connection.status', async ({ params, respond }) => {
      if (!params || Object.keys(params).some(k => k !== 'expectedRef') || (params.expectedRef !== undefined && (!network || !isSetupRef(params.expectedRef)))) { respond(false, undefined, { code: 'INVALID_REQUEST', message: 'Expected empty parameters' }); return; }
      try {
        const readConfig = (): RuntimeConfig => api.runtime.config.current().plugins?.entries?.unifi?.config ?? {};
        const config = readConfig();
        const expected = params.expectedRef;
        // A source-only canonicalization may advance refs without replacing resolved
        // bytes. The unique generation marker MUST be in the same runtime object
        // as the credential. Missing/old markers fail closed before any GET.
        const matches = () => !expected || (config.setupBinding === expected.id && readConfig() === config && sameRef(sourceReader()?.plugins?.entries?.unifi?.config?.apiKey, expected));
        if (!matches()) { respond(true, { configured: credentialAvailable(config), connected: false, code: 'configuration_not_active' }); return; }
        const result = network ? await checkConnection(config, { assertCurrent() { if (!matches()) throw new Error('configuration_not_active'); } }) : { configured: credentialAvailable(config), connected: false };
        if (!matches()) { respond(true, { configured: credentialAvailable(config), connected: false, code: 'configuration_not_active' }); return; }
        respond(true, result);
      } catch { respond(false, undefined, { code: 'UNAVAILABLE', message: 'UniFi connection check unavailable' }); }
    }, { scope: 'operator.read' });
  }
}

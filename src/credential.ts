import { credentialAvailable } from './client.js';
import type { RuntimeConfig } from './types.js';

type PreparedInput = { value?: string; revision: number };
export type PreparedReader = (pluginId: string, path: string) => PreparedInput;
/** Read only the host-prepared capability snapshot in the active invocation.
 * Never resolve refs, read stores/environment, or retain a credential for reuse.
 */
export async function captureCredential(config: RuntimeConfig, reader?: PreparedReader) {
  const ref = config.apiKey;
  if (credentialAvailable(config) || !ref || typeof ref !== 'object') {
    return { config, revision: undefined, state: credentialAvailable(config) ? 'ready' : typeof ref === 'string' ? 'invalid_format' : 'not_configured', isCurrent: () => true };
  }
  const read = reader ?? (await import('openclaw/plugin-sdk/secret-input-runtime')).getPreparedPluginSecretInput;
  const prepared = read('unifi', 'apiKey');
  return {
    config: { ...config, apiKey: prepared.value },
    revision: prepared.revision,
    state: credentialAvailable({apiKey: prepared.value}) ? 'ready' : prepared.value ? 'invalid_format' : 'not_prepared',
    isCurrent: () => {
      const current = read('unifi', 'apiKey');
      return current.revision === prepared.revision && current.value === prepared.value;
    },
  };
}

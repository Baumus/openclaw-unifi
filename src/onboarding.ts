/** Browser-only orchestration. Plaintext goes ONLY to the host-owned secret RPC. */
export type RequestHost = { request: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T> };
export type ConnectionResult = { configured: boolean; connected: boolean; sites?: number; code?: string; status?: number };
export type SecretRef = { source: 'store'; provider: string; id: string };
export type PendingStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
type Snapshot = { hash?: string; valid?: boolean; config?: { secrets?: { defaults?: { store?: string } }; plugins?: { entries?: { unifi?: { config?: { apiKey?: unknown; setupBinding?: unknown } } } } } };
export class SetupFailure extends Error {
  constructor(readonly stage: 'permission' | 'token' | 'configuration' | 'storage' | 'activation' | 'connection') { super(stage); }
}
export function validToken(value: string) { return value.length > 0 && value.length <= 4096 && !/[\x00-\x20\x7f]/.test(value); }
export function isSetupRef(value: unknown): value is SecretRef {
  if (!value || typeof value !== 'object') return false;
  const r = value as SecretRef;
  return Object.keys(r).length === 3 && r.source === 'store' && typeof r.provider === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(r.provider) && typeof r.id === 'string' && /^OPENCLAW_UNIFI_[A-F0-9]{32}$/.test(r.id);
}
export function sameRef(a: unknown, b: SecretRef) { return isSetupRef(a) && a.source === b.source && a.provider === b.provider && a.id === b.id; }
export class Onboarding {
  private pending?: SecretRef;
  private createdAt = 0;
  private busy = false;
  constructor(private host: RequestHost, private signal: AbortSignal, private storage?: PendingStorage, private storageKey = 'openclaw.unifi.setup.pending') {
    try {
      const saved = JSON.parse(storage?.getItem(storageKey) ?? 'null');
      if (saved && isSetupRef(saved.ref) && Number.isSafeInteger(saved.createdAt) && Date.now() >= saved.createdAt && Date.now() - saved.createdAt < 3_600_000) { this.pending = saved.ref; this.createdAt = saved.createdAt; }
      else storage?.removeItem(storageKey);
    } catch { /* Browser privacy policy may block optional reference-only recovery. */ }
  }
  private current() { this.signal.throwIfAborted(); }
  private remember() { try { if (this.pending) this.storage?.setItem(this.storageKey, JSON.stringify({ ref: this.pending, createdAt: this.createdAt })); else this.storage?.removeItem(this.storageKey); } catch { /* No token is ever stored here. */ } }
  private async stored(ref: SecretRef) {
    const result = await this.host.request<{ entries: { name: string; kind: string }[] }>('secrets.store.list', {});
    this.current();
    return Array.isArray(result.entries) && result.entries.some(e => e.name === ref.id && e.kind === 'secret');
  }
  private async verify(ref: SecretRef): Promise<ConnectionResult> {
    const source = await this.host.request<Snapshot>('config.get', {});
    this.current();
    if (!sameRef(source.config?.plugins?.entries?.unifi?.config?.apiKey, ref) || source.config?.plugins?.entries?.unifi?.config?.setupBinding !== ref.id) throw new SetupFailure('activation');
    const result = await this.host.request<ConnectionResult>('unifi.connection.check', { expectedRef: ref });
    this.current();
    if (result.connected) { this.pending = undefined; this.remember(); }
    return result;
  }
  async check(): Promise<ConnectionResult> {
    this.current();
    if (this.pending) return this.verify(this.pending);
    const result = await this.host.request<ConnectionResult>('unifi.connection.check', {});
    this.current(); return result;
  }
  async connect(value: string, canAdmin: boolean): Promise<ConnectionResult> {
    if (this.busy) throw new SetupFailure('activation');
    if (!canAdmin) throw new SetupFailure('permission');
    // Reject whitespace as written; do not silently transform a credential.
    let token = value; value = '';
    if (token && !validToken(token)) throw new SetupFailure('token');
    if (!token && !this.pending) throw new SetupFailure('token');
    this.busy = true;
    let stage: ConstructorParameters<typeof SetupFailure>[0] = 'configuration';
    try {
      this.current();
      const before = await this.host.request<Snapshot>('config.get', {});
      this.current();
      if (!before.hash || before.valid === false) throw new SetupFailure('configuration');
      if (token) {
        const provider = before.config?.secrets?.defaults?.store ?? 'default';
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(provider)) throw new SetupFailure('configuration');
        this.pending = { source: 'store', provider, id: 'OPENCLAW_UNIFI_' + crypto.randomUUID().replaceAll('-', '').toUpperCase() };
        this.createdAt = Date.now(); this.remember(); // BEFORE the potentially committed-but-unacknowledged write.
        stage = 'storage';
        try { await this.host.request('secrets.store.set', { name: this.pending.id, value: token, kind: 'secret' }); }
        catch { this.current(); if (!await this.stored(this.pending)) throw new SetupFailure('storage'); }
        token = ''; this.current();
      } else {
        stage = 'storage';
        if (!await this.stored(this.pending!)) throw new SetupFailure('token');
      }
      stage = 'activation';
      const ref = this.pending!;
      const snapshot = await this.host.request<Snapshot>('config.get', {});
      this.current();
      if (!snapshot.hash || snapshot.valid === false) throw new SetupFailure('activation');
      if (!sameRef(snapshot.config?.plugins?.entries?.unifi?.config?.apiKey, ref) || snapshot.config?.plugins?.entries?.unifi?.config?.setupBinding !== ref.id) {
        try {
          const ack = await this.host.request<{ ok?: boolean; degradedSecretOwners?: unknown[]; restart?: { scheduled?: boolean } }>('config.patch', { baseHash: snapshot.hash, raw: JSON.stringify({ plugins: { entries: { unifi: { config: { apiKey: ref, setupBinding: ref.id } } } } }), note: 'Connect UniFi using protected token' });
          this.current();
          if (ack.ok !== true || ack.degradedSecretOwners?.length || ack.restart?.scheduled) return { configured: true, connected: false, code: 'configuration_not_active' };
        } catch {
          // Do not replay. A lost acknowledgement is reconciled with persisted AND active source below.
          this.current();
        }
      }
      stage = 'connection';
      return await this.verify(ref);
    } catch (error) {
      if (this.signal.aborted) throw error;
      throw error instanceof SetupFailure ? error : new SetupFailure(stage);
    } finally { token = ''; this.busy = false; }
  }
  get canRetry() { return !!this.pending; }
}

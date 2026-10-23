/**
 * Adapted from us-all/unifi-mcp-server src/client.ts and src/connector-client.ts
 * at 4a3e0163f470496b948bf6e54129dd65a3ebfb4e (MIT, Copyright 2026 us-all).
 * Retained: class request/get/post flow, URLSearchParams encoding, X-API-KEY and
 * Accept/Content-Type construction, JSON body, timeout and 204 handling.
 * Changed: fixed origin, official /v1 + /proxy route, all five methods, injected
 * runtime credential, no retries/global config, strict redirect and byte bounds,
 * cancellation and sanitized errors. Original files and license: third_party/.
 */
import { UniFiError, fail } from "./errors.js";
import { API_ORIGIN } from "./request.js";
import type { RequestPlan, RuntimeConfig } from "./types.js";

export type TransportOptions = { fetch?: typeof fetch; assertCurrent?: () => void };
export function runtimeLimits(config: RuntimeConfig) {
  const timeoutMs = config.requestTimeoutMs ?? 30_000;
  const maxBytes = config.maxResponseBytes ?? 10 * 1024 * 1024;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000 || !Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 10 * 1024 * 1024) fail("invalid_runtime_config");
  return { timeoutMs, maxBytes };
}
export function credentialAvailable(config: RuntimeConfig): boolean {
  const key = config.apiKey;
  return typeof key === "string" && key.length > 0 && key.length <= 4096 && !/[\x00-\x20\x7f]/.test(key);
}
function redact(value: unknown, key: string): unknown {
  let nodes = 0;
  const clean = (s: string) => s.split(key).join("[REDACTED]").split(encodeURIComponent(key)).join("[REDACTED]");
  function visit(v: unknown, depth: number): unknown {
    if (++nodes > 200_000 || depth > 64) fail("response_too_complex");
    if (typeof v === "string") return clean(v);
    if (Array.isArray(v)) return v.map(item => visit(item, depth + 1));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = Object.create(null);
      for (const [name, item] of Object.entries(v)) out[clean(name)] = visit(item, depth + 1);
      return out;
    }
    return v;
  }
  return visit(value, 0);
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
export class UniFiClient {
  constructor(private readonly config: RuntimeConfig, private readonly options: TransportOptions = {}) {}
  async request(plan: RequestPlan, callerSignal?: AbortSignal) {
    if (plan.url.origin !== API_ORIGIN || plan.url.username || plan.url.password || plan.url.hash || !plan.url.pathname.startsWith("/v1/")) fail("invalid_destination");
    const { timeoutMs, maxBytes } = runtimeLimits(this.config);
    if (!credentialAvailable(this.config)) fail("credential_unavailable");
    const apiKey = this.config.apiKey as string;
    const mutation = plan.method !== "GET";
    const outcome = mutation ? "unknown" as const : undefined;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([timeout, callerSignal]) : timeout;
    const headers: Record<string, string> = { "X-API-KEY": apiKey, Accept: "application/json" };
    if (plan.body !== undefined) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const requestSignal = AbortSignal.any([signal, controller.signal]);
    let response: Response | undefined;
    try {
      signal.throwIfAborted();
      this.options.assertCurrent?.();
      response = await abortable((this.options.fetch ?? fetch)(plan.url, {
        method: plan.method, headers,
        body: plan.body,
        signal: requestSignal,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
      }), signal);
      if (response.status >= 300 && response.status < 400) throw new UniFiError("redirect_rejected", response.status, outcome);
      if (!response.ok) throw new UniFiError("http_error", response.status, response.status >= 500 ? outcome : undefined);
      const length = response.headers.get("content-length");
      if (length !== null && Number(length) > maxBytes) throw new UniFiError("response_too_large", response.status, outcome);
      if (response.status === 204 || !response.body) return { ok: true as const, status: response.status, data: null };
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const chunk = await abortable(reader.read(), signal);
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) throw new UniFiError("response_too_large", response.status, outcome);
          chunks.push(chunk.value);
        }
      } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      signal.throwIfAborted();
      if (bytes === 0) return { ok: true as const, status: response.status, data: null };
      const text = Buffer.concat(chunks, bytes).toString("utf8");
      let data: unknown;
      try { data = JSON.parse(text); } catch { throw new UniFiError("invalid_json_response", response.status, outcome); }
      this.options.assertCurrent?.();
      return { ok: true as const, status: response.status, data: redact(data, apiKey) };
    } catch (error) {
      if (error instanceof UniFiError) {
        if (mutation && response?.ok && !error.outcome) throw new UniFiError(error.code, error.status ?? response.status, "unknown");
        throw error;
      }
      if (callerSignal?.aborted) throw new UniFiError("cancelled", undefined, outcome);
      if (timeout.aborted) throw new UniFiError("timeout", undefined, outcome);
      throw new UniFiError("transport_error", undefined, outcome);
    } finally {
      controller.abort();
      // Do not await cancellation of an untrusted/never-ending upstream stream.
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    }
  }
}

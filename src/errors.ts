export class UniFiError extends Error {
  constructor(readonly code: string, readonly status?: number, readonly outcome?: "unknown") {
    super(code);
    this.name = "UniFiError";
  }
}
export function fail(code = "invalid_request"): never { throw new UniFiError(code); }
export function errorDetails(error: unknown) {
  const known = error instanceof UniFiError ? error : new UniFiError("internal_error");
  return { ok: false as const, error: { code: known.code, ...(known.status === undefined ? {} : { status: known.status }), ...(known.outcome ? { outcome: known.outcome } : {}) } };
}

import { config } from "./config.js";
import { withRetry } from "./retry.js";

const REQUEST_TIMEOUT_MS = 30_000;

export class UniFiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "UniFiError";
    this.status = status;
    this.body = body;
  }
}

class UniFiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    options?: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
    },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const headers: Record<string, string> = {
      "X-API-KEY": config.apiKey,
      Accept: "application/json",
    };

    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    return withRetry(async () => {
      const response = await fetch(url, {
        method,
        headers,
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = await response.text().catch(() => "");
        }
        throw new UniFiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          body,
        );
      }

      if (response.status === 204 || response.headers.get("content-length") === "0") {
        return {} as T;
      }

      return response.json() as Promise<T>;
    });
  }

  async get<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }
}

export const unifiClient = new UniFiClient();

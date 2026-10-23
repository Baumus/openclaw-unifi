import { config, isConnectorAvailable } from "./config.js";
import { withRetry } from "./retry.js";

const CONNECTOR_TIMEOUT_MS = 30_000;

export class ConnectorError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ConnectorError";
    this.status = status;
    this.body = body;
  }
}

export class ConnectorUnavailableError extends Error {
  constructor() {
    super("Cloud Connector not available. Set UNIFI_API_KEY_OWNER to enable.");
    this.name = "ConnectorUnavailableError";
  }
}

class ConnectorClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.baseUrl;
  }

  private assertAvailable(): void {
    if (!isConnectorAvailable()) {
      throw new ConnectorUnavailableError();
    }
  }

  private buildConnectorUrl(
    hostId: string,
    appPath: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const encodedHostId = encodeURIComponent(hostId);
    const url = new URL(`${this.baseUrl}/connector/consoles/${encodedHostId}/${appPath}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async get<T = unknown>(
    hostId: string,
    appPath: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    this.assertAvailable();

    const url = this.buildConnectorUrl(hostId, appPath, params);

    return withRetry(async () => {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-API-KEY": config.ownerApiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
      });

      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = await response.text().catch(() => "");
        }
        throw new ConnectorError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          body,
        );
      }

      return response.json() as Promise<T>;
    });
  }
}

export const connectorClient = new ConnectorClient();

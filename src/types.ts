export type JsonSchema = Record<string, any>;
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Parameter = { name: string; in: string; required?: boolean; schema?: JsonSchema; style?: string; explode?: boolean; description?: string; content?: Record<string, {schema: JsonSchema}> };
export type Operation = { operationId: string; api: "site-manager" | "network"; method: Method; path: string; summary?: string; description?: string; parameters: Parameter[]; requestBody?: { required?: boolean; content: Record<string, {schema?: JsonSchema}> }; responses: Record<string, unknown>; tags?: string[]; security?: unknown; deprecated?: boolean };
export type Catalog = { version: number; sources: { api: string; file: string; url: string; sha256: string; retrieved: string }[]; operations: Operation[] };
export type RequestInput = { operationId: string; consoleId?: string; path?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown };
export type RequestPlan = { operationId: string; method: Method; url: URL; body?: string };
export type RuntimeConfig = { apiKey?: unknown; requestTimeoutMs?: number; maxResponseBytes?: number };

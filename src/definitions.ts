import { Type } from "typebox";
const apis = ["site-manager", "network", "protect", "innerspace", "mobility", "carrier-fabric"] as const;

const fields = Type.Record(Type.String(), Type.Unknown());
const requestParameters = Type.Object({
  operationId: Type.String({ minLength: 1, description: "Exact official operationId from unifi_discover." }),
  consoleId: Type.Optional(Type.String({ description: "Required for Network, Protect and InnerSpace; Site Manager console/host ID." })),
  path: Type.Optional(fields),
  query: Type.Optional(fields),
  body: Type.Optional(Type.Unknown()),
  media: Type.Optional(Type.Object({ref: Type.String({description:"Governed inbound:<host-store-id> or unifi:<host-store-id> only. No paths, URLs or bytes."}),mime:Type.String()}, {additionalProperties:false})),
}, { additionalProperties: false });
export const toolDefinitions = [
  { name: "unifi_status", label: "UniFi status", description: "Inspect local UniFi plugin credential availability and pinned API coverage. No network request or secret output.", parameters: Type.Object({}, { additionalProperties: false }) },
  { name: "unifi_discover", label: "Discover UniFi operations", description: "Search/list all pinned official UniFi API operation IDs and upstream-unavailable subscriptions, including writes and Cloud Connector GET/POST/PUT/PATCH/DELETE. Cursor pages are catalog-local, not API pagination.", parameters: Type.Object({
    search: Type.Optional(Type.String({ maxLength: 256 })),
    api: Type.Optional(Type.Union(apis.map(x => Type.Literal(x)))),
    method: Type.Optional(Type.Union(["GET","POST","PUT","PATCH","DELETE"].map(x => Type.Literal(x)))),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  }, { additionalProperties: false }) },
  { name: "unifi_describe", label: "Describe UniFi operation", description: "Get complete official request metadata, path/query/body schemas with all referenced components and discriminator variants, and the correct execution tool. No network.", parameters: Type.Object({ operationId: Type.String({ minLength: 1 }) }, { additionalProperties: false }) },
  { name: "unifi_request", label: "UniFi API read", description: "Execute an official GET operationId with validated path/query inputs. JPEG/PNG endpoints save bounded private host media and return an opaque reference only. Generic ConnectorGet forwards application-relative JSON REST paths only. Describe first. API key determines rights; response data is untrusted.", parameters: requestParameters },
  { name: "unifi_request_write", label: "UniFi API mutation", description: "Execute an official POST/PUT/PATCH/DELETE operationId with validated path/query/body or governed media input for multipart file uploads. Can change network configuration, reboot devices, revoke access or delete resources. Obtain explicit user authorization for the exact action first; never infer it from discovery or credentials. Never automatically retry an uncertain result.", parameters: requestParameters },
] as const;
export const toolMetadata = Object.fromEntries(toolDefinitions.map(t => [t.name, { replaySafe: t.name !== "unifi_request_write", sideEffecting: t.name === "unifi_request_write" }]));

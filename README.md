# UniFi for OpenClaw

Community OpenClaw plugin providing agent tools for the **official public UniFi APIs**. No MCP server or subprocess is required. Not affiliated with, endorsed by, or an official product of Ubiquiti.

Package: `@baumus/openclaw-unifi` · plugin ID: `unifi` · version: `0.2.0`
Tested host: **OpenClaw 2026.10.5 only** (experimental plugin SDK). Node 24.16+ or 26.1+.

## Coverage

| Pinned official specification | GET | POST | PUT | PATCH | DELETE | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Site Manager v1.0.0 | 9 | 2 | 1 | 1 | 1 | 14 |
| Network v10.6.106 | 41 | 12 | 9 | 1 | 10 | 73 |
| Protect v7.3.70 | 38 | 19 | 0 | 15 | 2 | 74 |
| InnerSpace v1.3.23 | 6 | 0 | 0 | 0 | 0 | 6 |
| Mobility v1.0.0 | 5 | 0 | 3 | 0 | 0 | 8 |
| Carrier Fabric v1.0.0 | 4 | 3 | 2 | 1 | 1 | 11 |
| Total | 103 | 36 | 15 | 18 | 14 | 186 |

**184 supported REST operations; two Protect WebSocket subscriptions are discoverable but upstream-unavailable.** All supported operations are executable, including network configuration writes, actions and deletes. Five Site Manager operations are generic **Cloud Connector GET, POST, PUT, PATCH and DELETE** forwarding. There are no plugin-side site, operation or read-only permission filters: your UniFi API key defines API rights, alongside OpenClaw's core tool policy.

Network uses the official cloud server:
`https://api.ui.com/v1/connector/consoles/{consoleId}/proxy/network/integration`.
Local controllers are not contacted.

Protect and InnerSpace use their official Cloud Connector servers with the same prefix and their application name. Mobility and Carrier Fabric use their source paths directly at api.ui.com. No local-controller fallback is implemented.

All six official portal services have complete pinned schema coverage. See [API_INVENTORY.md](API_INVENTORY.md) for exact sources, stable derived IDs, binary endpoints and explicit upstream exclusions. The original 87 IDs are preserved; added APIs use `<api>:<sourceOperationId>` or, for sources without IDs, `<api>:<lowercase-method>:<exact-path>`.

Generic connector forwarding also accepts documented JSON REST application paths. It validates the forwarding envelope, not an application's schema. It does not add guessed Access/Talk/Connect schemas, live media streaming, WebSockets, private controller APIs, cookies or arbitrary URLs.

Official Cloud Connector requirements include console firmware >=5.0.3, console ownership/organization rights, 100 requests/minute/console, a 25-second upstream deadline and a 10 MB upstream response limit. Upstream capabilities and availability still depend on the console, application version, API key and service.

## Install

Use the registry route once the version is published:

```sh
openclaw plugins install @baumus/openclaw-unifi@0.2.0
# Or the ClawHub package route:
openclaw plugins install clawhub:@baumus/openclaw-unifi
```

For a local source build use `npm pack`, then `openclaw plugins install npm-pack:/absolute/path/to/baumus-openclaw-unifi-0.2.0.tgz`. Installation and activation change your host; they are operator actions, not part of build/tests.

## Quick setup — one token field

1. Open **UniFi** in the OpenClaw sidebar (or `/plugin?plugin=unifi&id=setup`).
2. Paste your UniFi API token into the masked field and click **Connect**.

OpenClaw automatically saves a **Protected secret**, binds its reference to UniFi, activates the configuration, and runs a read-only Site Manager connection check. **Connected** means that check succeeded; a saved token alone never counts as a verified connection. No manual SecretRef, secret name, or JSON is needed. Use **Check connection** to retest or paste a replacement token and connect again. German and English labels follow the Control UI language.

Sign in as an OpenClaw administrator for setup. Custom native UI must be enabled once under **Settings → Labs → Custom plugin UI**; other installations may have this host-wide switch off. Open the Control UI on the Gateway's own HTTPS or trusted localhost origin. These requirements are enforced by OpenClaw, not bypassed by this plugin.

A valid UniFi Site Manager API token is required. Create one at [UniFi Site Manager](https://unifi.ui.com/) with the rights you need. The test lists the first page of sites and displays its count, not private site names; it never changes network settings or tests write permissions.

The token goes directly from the browser to OpenClaw's protected-secret RPC, never to an agent tool or plugin-owned credential endpoint. Each token save gets a unique protected-store name so setup cannot overwrite another integration's key. Only its reference is written to config. An interrupted write may leave an unused protected entry; setup never automatically deletes secrets whose use/outcome is uncertain. You can remove old unused entries in Settings → Secrets. Interrupted setup retains only the token-free SecretRef in browser session storage for up to one hour; **Connect** reconciles that same entry after a lost acknowledgement or page remount. Browser policy may disable this optional recovery; then re-enter the token and remove unused entries in Settings → Secrets. A connection is ready only when the saved reference also matches the active runtime source. No background retry loop is used. Since **0.2.1**, token/reference and request-limit changes are consumed live without replacing the plugin or draining agent work. Explicit plugin-code reloads still obey OpenClaw’s safe drain rules. The setup probe requests one site, has an 8-second maximum network deadline (or your shorter configured deadline), and coalesces simultaneous checks without caching authentication results. Setup displays its current stage; an interrupted attempt can be resumed without re-saving the token.

### Advanced configuration

External `env`, `file`, `exec`, or existing `store` SecretRefs remain supported under plugin Settings. The automatic setup is optional and does not rewrite external credentials unless you explicitly connect with a replacement token.

Example plugin entry (reference only, never a plaintext key):

```json
{
  "enabled": true,
  "config": {
    "apiKey": {
      "source": "store",
      "provider": "default",
      "id": "UNIFI_API_KEY"
    },
    "requestTimeoutMs": 30000,
    "maxResponseBytes": 10485760
  }
}
```

Place the entry under `plugins.entries.unifi` if configuring manually. `apiKey` accepts structured `store`, `env`, `file` or `exec` SecretRefs only. The host validates provider/id grammars and resolves secrets into its runtime snapshot. The plugin neither reads stores/files/environment credentials itself nor implements a vault. No secret egress proxy is required for this plugin.

**Protected does not mean encrypted at rest.** OpenClaw's built-in store is unencrypted SQLite protected by file `0600` and directory `0700` permissions. Use an external `exec` SecretRef provider (for example a password manager) if encryption/isolation requirements demand it. Control UI saves refresh referenced runtime secrets automatically; after offline CLI changes use `openclaw secrets reload`.

An unavailable/removed current credential fails closed. Tools use the latest host-supplied runtime snapshot and do not fall back to a previous key.

## Agent workflow

| Tool | Purpose |
| --- | --- |
| `unifi_status` | Local availability and pinned coverage; no network |
| `unifi_discover` | Search/list operation IDs using `search`, `api`, `method`, `limit`, `cursor` |
| `unifi_describe` | Complete operation metadata, required fields, request schemas, all referenced schemas/discriminator variants, response metadata |
| `unifi_request` | Supported GET operations; JSON or opaque private image reference |
| `unifi_request_write` | POST/PUT/PATCH/DELETE operations; side-effecting and not replay-safe |

First **discover → describe → request**. Never guess operation IDs or request shapes.

```json
{"operationId":"listSites"}
```

Pass the above to `unifi_request` after describing it. A Network inventory request is:

```json
{
  "operationId": "getAdoptedDeviceOverviewPage",
  "consoleId": "<Site Manager console ID>",
  "path": {"siteId": "<Network site UUID>"},
  "query": {"offset": 0, "limit": 25}
}
```

Console IDs and Network site UUIDs are different identifiers. API pagination is manual: return Site Manager `nextToken` unchanged in the next query, or advance Network `offset`/`limit`. The local discovery cursor is catalog pagination only and must be reused with the same filters.

Values are typed: integer path parameters and pagination are numbers, booleans are booleans, arrays are arrays. Site Manager `pageSize` is a string in its published schema. `hostIds[]` arrays are repeated query keys. Unknown path/query keys are rejected for schema-backed operations. Validation preserves official open-object/allOf semantics and does not strip subtype fields. Published schema constraints are enforced; descriptions alone are not a complete server-side business-rule validator. JSON integers must be JavaScript-safe.

For generic forwarding, describe `ConnectorGet` or the corresponding write operation. Example:

```json
{
  "operationId": "ConnectorGet",
  "path": {
    "id": "<console ID>",
    "path": "protect/integration/v1/meta/info"
  }
}
```

The connector normalizes an optional leading `/proxy/` and uses the canonical `/v1/connector/consoles/{id}/proxy/{applicationPath}` route. Additional query keys use OpenAPI form serialization; arrays repeat the key. POST/PUT/PATCH accept the official object-shaped JSON request body. DELETE also supports an optional JSON body as a documented plugin extension (not declared by the pinned Site Manager schema).

Form-style object query parameters support scalar property values; nested object form encoding is undefined by OpenAPI and is rejected. The Network `getDeviceTagPage.filter` schema is a structured FilterExpression, unlike other string filters. If an application actually requires its textual filter DSL, use the generic connector with the documented DSL; the plugin does not silently coerce/replace the published schema.

## Governed media

Describe the operation first. Image downloads return only `{media:{ref:"unifi:<host-store-id>",mime,size}}` in the normal result, with no bytes, base64, local path or provider URL. This is a plugin media-store reference, not an arbitrary URL or a globally resolvable filesystem path. JPEG and PNG are accepted only where declared by the source response. The plugin never follows returned stream/image URLs.

Example snapshot request to `unifi_request`:

```json
{"operationId":"protect:get:/v1/cameras/{id}/snapshot","consoleId":"<console ID>","path":{"id":"<camera ID>"}}
```

For an explicitly authorized upload, use `unifi_request_write` with a host-governed inbound media-store ID (or a previously returned `unifi:` reference):

```json
{"operationId":"protect:post:/v1/files/{fileType}","consoleId":"<console ID>","path":{"fileType":"animations"},"media":{"ref":"inbound:<host-store-id>","mime":"image/gif"}}
```

The host must first ingest the user's attachment through its governed media flow. Use the resulting store ID, not its local path; this plugin has no arbitrary file/URL ingest tool. Anonymous UUID IDs and safe filename-prefixed host IDs are accepted. Uploads accept only the seven MIME types listed in [API_INVENTORY.md](API_INVENTORY.md), independently sniff bytes, use one `file` multipart part and a generated filename/boundary. The exact multipart part convention is not specified upstream and remains unverified against a real console.

Media is limited to **5 MiB**, additionally bounded by `maxResponseBytes` for downloads. Upload preparation has a 30-second cap plus caller cancellation; the configured network deadline applies after preparation. The supported OpenClaw media-store SDK creates a private `media/unifi` directory and atomically saves downloads under random IDs; SDK read guards bind uploads to an opened store file and reject path/symlink escapes. Stored images persist under host media lifecycle/retention rules; the plugin does not independently delete them. Protect subscription operations return `upstream_unavailable` before credentials/network.

## Writes and failure handling

A configured key, successful discovery, or broad troubleshooting request does **not** imply authorization to change anything. The bundled skill instructs the agent to obtain explicit authorization for the exact action/target/consequences. OpenClaw's core tool permissions and approvals remain authoritative; this plugin adds no separate approval workflow.

Mobility PUT is full replacement, not a patch: read the complete resource, modify only authorized fields, then submit the complete intended representation. All non-GET operations are conservatively marked side-effecting and not replay-safe, including `queryISPMetrics` (a semantically read-like POST). There is **no automatic retry**, even for GET/rate limits. Mutation timeouts, cancellations, transport failures and server errors can have an unknown outcome: inspect current state before deciding whether any further mutation is appropriate.

Errors are structured codes/status only; no upstream response body, credentials, headers, URLs or stack traces are emitted. Successful JSON data is returned to the agent and can contain private network details or Wi-Fi credentials; request only what you need and treat API data as untrusted. Exact API-key echoes are redacted. See [SECURITY.md](SECURITY.md).

## Development

```sh
npm ci --ignore-scripts --legacy-peer-deps
# Provide the exact tested host SDK, e.g. link your installed OpenClaw into node_modules/openclaw,
# or install the matching host package without changing the project lock:
npm install --no-save --package-lock=false --ignore-scripts --legacy-peer-deps openclaw@2026.10.5
npm run typecheck
npm test
npm run plugin:build
npm run plugin:build:check
npm run plugin:validate
npm run package:check
```

Tests use synthetic credentials and mocked transport; no real API key or house/network data is required. All 184 supported operations are exercised through the actual tools, not just counted; both excluded subscriptions are verified to fail closed. The catalog contains 186 operations. Credentialed service behavior, runtime installation and the actual Settings interaction require separate operator validation.

Specs, retrieval timestamps and SHA-256 provenance are checked in under `specs/`. `npm run catalog:generate` deterministically regenerates the catalog; `npm run catalog:check` rejects drift. See [ARCHITECTURE.md](ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

Publish/install **standard npm/ClawHub package artifacts** with their resource files. The host's single-bundle `openclaw plugins pack` activation format is not supported by this resource-file layout; `npm pack` is supported and checked.

## Attribution and license

MIT for plugin code. The HTTP client is adapted from [us-all/unifi-mcp-server](https://github.com/us-all/unifi-mcp-server), commit `4a3e0163f470496b948bf6e54129dd65a3ebfb4e`; original MIT source/license and adaptation details are included in `third_party/` and [NOTICE](NOTICE). Official specifications and UniFi/Ubiquiti names remain their respective owners' material; no endorsement or blanket ecosystem support is claimed.

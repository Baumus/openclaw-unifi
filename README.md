# UniFi for OpenClaw

Community OpenClaw plugin providing agent tools for the **official UniFi Site Manager and Network APIs**. No MCP server or subprocess is required. Not affiliated with, endorsed by, or an official product of Ubiquiti.

Package: `@baumus/openclaw-unifi` · plugin ID: `unifi` · version: `0.1.0`  
Tested host: **OpenClaw 2026.10.5 only** (experimental plugin SDK). Node 24.16+ or 26.1+.

## Coverage

| Pinned official specification | GET | POST | PUT | PATCH | DELETE | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Site Manager v1.0.0 | 9 | 2 | 1 | 1 | 1 | 14 |
| Network v10.6.106 | 41 | 12 | 9 | 1 | 10 | 73 |
| Total | 50 | 14 | 10 | 2 | 11 | 87 |

Every catalog operation is executable, including network configuration writes, actions and deletes. Five Site Manager operations are generic **Cloud Connector GET, POST, PUT, PATCH and DELETE** forwarding. There are no plugin-side site, operation or read-only permission filters: your UniFi API key defines API rights, alongside OpenClaw's core tool policy.

Network uses the official cloud server:
`https://api.ui.com/v1/connector/consoles/{consoleId}/proxy/network/integration`.
Local controllers are not contacted.

Generic connector forwarding can call JSON REST application endpoints, including future endpoints, through this same fixed origin. It validates the forwarding envelope, not another application's endpoint schema. It is **not comprehensive schema coverage of Protect, Access, InnerSpace, Talk or the UniFi ecosystem**, and does not implement binary media, live camera streams, WebSockets, legacy private controller APIs, cookies or arbitrary URLs.

Official Cloud Connector requirements include console firmware >=5.0.3, console ownership/organization rights, 100 requests/minute/console, a 25-second upstream deadline and a 10 MB upstream response limit. Upstream capabilities and availability still depend on the console, application version, API key and service.

## Install

Use the registry route once the version is published:

```sh
openclaw plugins install @baumus/openclaw-unifi@0.1.0
# Or the ClawHub package route:
openclaw plugins install clawhub:@baumus/openclaw-unifi
```

For a local source build use `npm pack`, then `openclaw plugins install npm-pack:/absolute/path/to/baumus-openclaw-unifi-0.1.0.tgz`. Installation and activation change your host; they are operator actions, not part of build/tests.

## Configure securely in Settings

1. Create a UniFi API key with the rights you actually need in UniFi Site Manager. Use a separate key for this integration when possible.
2. Open OpenClaw **Settings → Secrets**, add `UNIFI_API_KEY` as a **Protected secret**, and enter the key only in that masked form. The supported agent `secrets` tool can open the same protected prompt; the value does not enter chat.
3. In plugin Settings, set **UniFi API key reference** (`apiKey`) to the full returned SecretRef. Preserve the returned provider alias; `default` below is an example.
4. Enable the plugin through OpenClaw and call `unifi_status`. It checks local resolved credential availability, **not** authentication. A subsequent authorized GET verifies access.

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
| `unifi_request` | GET operations only |
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

## Writes and failure handling

A configured key, successful discovery, or broad troubleshooting request does **not** imply authorization to change anything. The bundled skill instructs the agent to obtain explicit authorization for the exact action/target/consequences. OpenClaw's core tool permissions and approvals remain authoritative; this plugin adds no separate approval workflow.

All non-GET operations are conservatively marked side-effecting and not replay-safe, including `queryISPMetrics` (a semantically read-like POST). There is **no automatic retry**, even for GET/rate limits. Mutation timeouts, cancellations, transport failures and server errors can have an unknown outcome: inspect current state before deciding whether any further mutation is appropriate.

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

Tests use synthetic credentials and mocked transport; no real API key or house/network data is required. All 87 operations are exercised through the actual tools, not just counted. Credentialed service behavior, runtime installation and the actual Settings interaction require separate operator validation.

Specs, retrieval timestamps and SHA-256 provenance are checked in under `specs/`. `npm run catalog:generate` deterministically regenerates the catalog; `npm run catalog:check` rejects drift. See [ARCHITECTURE.md](ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

Publish/install **standard npm/ClawHub package artifacts** with their resource files. The host's single-bundle `openclaw plugins pack` activation format is not supported by this resource-file layout; `npm pack` is supported and checked.

## Attribution and license

MIT for plugin code. The HTTP client is adapted from [us-all/unifi-mcp-server](https://github.com/us-all/unifi-mcp-server), commit `4a3e0163f470496b948bf6e54129dd65a3ebfb4e`; original MIT source/license and adaptation details are included in `third_party/` and [NOTICE](NOTICE). Official specifications and UniFi/Ubiquiti names remain their respective owners' material; no endorsement or blanket ecosystem support is claimed.

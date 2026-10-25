# Architecture

## Boundaries and data flow

```text
OpenClaw source config (SecretRef only)
  → host secretInputs resolution / active runtime snapshot
  → tool factory → currentConfig at execution time
Agent JSON
  → plain-JSON / complexity check
  → official operation lookup + read/write surface
  → path/query/body schema validation + pure URL/body planning
  → current runtime credential + live invocation guard
  → UniFiClient (fixed api.ui.com HTTPS, redirect:error, no retries)
  → bounded stream → JSON + exact-key redaction OR sniffed JPEG/PNG → host media store → opaque reference
Governed inbound/unifi media ID → SDK bounded pinned-file read → MIME/size check → multipart → same write transport
```

No network happens during registration, discovery, description or catalog generation. Request planning completes before runtime credential access. The token defines UniFi rights. OpenClaw defines tool permissions/approvals; the plugin does not introduce site/operation authorization lists.

## Modules

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Lean registration, live-config no-op reload policy, lazy execution factories and static SDK metadata |
| `src/definitions.ts` | Tool declarations independent of catalog/schema/media implementations |
| `src/config.ts` | SecretRef-only source schema; latest runtime snapshot selection |
| `src/catalog.ts` | Pinned catalog/spec loading and integrity; cursor discovery; complete schema closure |
| `src/schema.ts` | Non-coercing AJV validation, OpenAPI normalization, discriminator/allOf inheritance; JSON bounds |
| `src/request.ts` | Pure request validation, canonical routes, safe segments, OAS query serialization |
| `src/client.ts` | Adapted upstream HTTP client; headers, deadline/cancellation, bounded reads and sanitized errors |
| `src/tools.ts` | Five tool schemas/handlers and honest replay/side-effect metadata |
| `src/media.ts` | SDK media-store I/O, fixed namespaces, byte/MIME validation, multipart preparation, opaque image references |

The published entry is modular ESM JavaScript under `dist/`, never a TypeScript runtime entry. Resources resolve relative to the emitted modules. Runtime dependencies are declared explicitly. The package does not spawn an MCP process, use private OpenClaw internals, access raw host config or implement secret storage.

## Specification source of truth

* Site Manager: https://developer.ui.com/site-manager/v1.0.0/openapi.json
* Network: https://developer.ui.com/network/v10.6.106/openapi.json
* Protect v7.3.70, InnerSpace v1.3.23, Mobility v1.0.0 and Carrier Fabric v1.0.0: exact official URLs in [API_INVENTORY.md](API_INVENTORY.md).
* Exact downloaded bytes, SHA-256 and retrieval date: `specs/provenance.json`.
* Deterministic derived catalog: `scripts/generate-catalog.mjs` → `specs/catalog.json`.

Generation includes all GET/POST/PUT/PATCH/DELETE operations and merges path-item/operation parameters with operation overrides. Parameter/requestBody references resolve locally. Schema refs stay local; external refs fail closed. Generation preserves the 87 original IDs, namespaces added source IDs, and derives stable method:path IDs where Protect/InnerSpace omit operationIds. Duplicate IDs, unsupported parameter locations or body media types fail closed. JSON and the declared Protect binary multipart upload are supported; the two Protect WebSocket subscriptions remain in discovery/description with explicit upstream-unavailable metadata and cannot execute. Source servers are never accepted as agent input. Network uses the first official cloud server, not its local-console alternative.

Catalog discovery exposes all 186 operations across six APIs, of which 184 are supported REST operations. Source metadata and complete schema closure remain available for the two unavailable subscriptions. Read/write separation is mechanical: GET is replay-safe/non-side-effecting; all other methods are not. No classifier guesses whether a POST is harmless. Connector calls are generic, so endpoint-specific effects remain the caller's responsibility.

## Schema handling

AJV validates a normalized JSON Schema with all referenced definitions. No coercion, defaults insertion, property removal or implicit object closure occurs. OpenAPI nullable, refs, allOf, oneOf/anyOf and standard formats/bounds are supported. A discriminator mapping expands to oneOf branches with a required tag constant and its subtype. A subtype's allOf reference to its dispatching parent uses a non-dispatching base definition to avoid recursive dispatch, preserving inherited required fields and subtype properties.

Protect's liveview request wrappers explicitly declare additionalProperties:false around allOf references without listing inherited properties. Normalization projects the referenced/allOf property names onto that explicit closure, keeping the original constraints in allOf, enforcing required fields and rejecting extra fields. This documented compatibility normalization is tested; it never implicitly closes open objects. Describe keeps the original source schema.

`unifi_describe` returns original request metadata plus all transitively referenced schemas and discriminator mappings, including recursive definitions without truncation. A schema-backed request validates path/query/body before reading the current credential. OAS schema constraints do not substitute for server business rules or encode every requirement described in prose.

Query serialization follows OAS defaults: form + explode=true, repeated arrays, scalar objects; explicit spaceDelimited, pipeDelimited, deepObject and JSON-content serializers are also implemented. Nested object form values fail rather than silently stringify. Site Manager's literal `hostIds[]` key is preserved. API continuation tokens are ordinary string values passed without parsing; URLSearchParams encodes transport once.

## URL and transport boundary

Only `https://api.ui.com` is used. Site Manager paths already include `/v1`. Network/Protect/InnerSpace prepend their first official cloud server pathname, `/v1/connector/consoles/{consoleId}/proxy/<application>/integration`. Site Manager/Mobility/Carrier Fabric paths already include their version/application prefix. Generic Connector* operations insert a canonical `proxy/{applicationPath}` suffix. No arbitrary origin, headers, credentials, redirects, raw percent-encoded paths, dot segments, slash-bearing IDs or query fragments in paths are accepted.

Request JSON is bounded to 1 MiB, 48 nesting levels and 100,000 visited nodes. URLs are bounded to 32 KiB. Requests have a 30-second default whole-operation deadline (100ms–120s configurable) and caller cancellation. Response streaming is bounded to at most 10 MiB and a JSON sanitization complexity limit (64 levels / 200,000 visited values). Official connector upstream bounds still apply independently. Reads and fetch waits have explicit abort races; readers/bodies are cancelled after failure or completion. Mutations are never retried. Binary image reads have an additional 5 MiB cap and declared-versus-sniffed MIME checks before publication. Multipart upload preparation reads only fixed inbound/unifi store namespaces via the exported SDK, caps bytes at 5 MiB and wait time at 30 seconds, and rechecks caller/invocation authority after awaits; no file/URL source loader is exposed. The fetch layer generates multipart boundaries. Image publication checks invocation authority and network deadline at SDK commit. Agents see references and metadata only. No private host paths or bytes are returned.

## Secret lifecycle

The manifest declares `apiKey` as `configContracts.secretInputs.paths` with `ownerKind: capability`. The host validates the reference in source config, resolves to an in-memory runtime string, and fails that capability cold on resolution failure. Tool calls use `getRuntimeConfig` first, then a supplied runtime snapshot, then registration's resolved `api.pluginConfig` only where no snapshot API exists. A present but unavailable/removed current snapshot never falls back.

The exact tested host is OpenClaw 2026.10.7. Static metadata uses the exported SDK contract; metadata generation/validation and runtime-registration consistency are tested. Future host versions need a new compatibility validation, not a broader speculative version range.

## Recovery and verification ownership

Source/catalog regeneration is reversible. Restore the prior reviewed package if necessary; never replay an uncertain mutation as recovery. This implementation does not activate/install itself, write live config, publish, or certify independent readiness. Producer tests cover all catalog routes and failure classes; an independent owner reviews the exact candidate, and the operator separately validates real authentication, installation and UI behavior.

## One-token onboarding (0.2.0)

`src/control-ui.ts` contributes a native UniFi page and navigation. `src/onboarding.ts` submits plaintext only to the host protected-store RPC, then patches the reference with the latest revision and invokes `unifi.connection.check`. Both backend connection RPCs read the current resolved runtime snapshot through the supported SDK. The existing five agent tools and all API catalog operations remain unchanged. Browser assets are built by `openclaw plugins build`, pinned in manifest `controlUi`, and included in the npm tarball.

Readiness is tied to `setupBinding`, a unique nonsecret generation marker patched atomically with the SecretRef. The backend reads marker and resolved key from one runtime config object, checks the expected source reference, and rejects snapshot replacement before/after the GET. Source-only canonicalization cannot make an old runtime key prove a new setup generation.


## Fast setup and reload behavior (0.2.1)

The entry registers `noopPrefixes: ["plugins.entries.unifi.config"]` via the public `api.registerReload` contract. All current config fields are read from the committed runtime at invocation time; no service/client captures them at registration. Token rotation and limit changes therefore publish a runtime snapshot without replacing the plugin or draining admitted agent work. This is not a bypass of explicit code reload, installation, enablement or other plugins’ reload policies. Any future config field captured at registration must narrow/revise this policy.

Tool declarations are independent of their implementations. Catalog/schema/media and the source-snapshot SDK load on first actual use rather than during entry registration. Media storage loads only for media handling. SDK imports remain public and version-pinned.

Browser config readback redacts SecretRef IDs. The browser therefore never uses that readback to attest credentials. It sends the known expected reference to the backend, which retains the full source-reference, same-resolved-object and setup-generation checks before and after its GET. The visible generation marker only selects resume reconciliation. A read-only backend status compares the exact hidden source reference and marker before a matching resume skips the patch; mismatches are repaired through the normal revision-guarded patch. Neither marker nor local status proves network readiness. A successful new connection needs five host RPCs rather than six.

The setup GET is fixed to the pinned Site Manager `GET /v1/sites?pageSize=1`. Its network deadline is `min(requestTimeoutMs, 8000)`; agent calls keep their normal configured limit. Concurrent checks share only the pending GET for the exact resolved config object. Results are never cached, token rotations never share checks, and each waiter independently rechecks its expected binding. Setup reports storage, activation and verification stages, plus explicit timeout/rate-limit errors.

Regression proof: `npm test`, `npm run test:host-reload` (read-only host fixtures in an isolated process), `npm run benchmark:startup`. No OpenClaw core edits are required. Full plugin-code reload remains subject to host-owned admitted-work settlement; this plugin does not hold artificial leases or terminate work.


Capability-owned credentials may remain authored SecretRefs in a call's config view. `src/credential.ts` uses only `getPreparedPluginSecretInput` from the public secret-input SDK in that active invocation, never a resolver or direct store read. A prepared input is used only when a credential reference is present; removed config never falls back. Its host revision/value is rechecked by the invocation guard, and concurrent setup checks do not share across prepared revisions. Resolved runtime strings retain the existing path. The setup generation and full source-reference gates remain mandatory; a prepared input cannot override an old generation marker.

## Upgrade inspection

The stateless `dist/doctor-contract-api.js` validates retained UniFi configuration against the existing SecretRef-only schema. It resolves no secrets, performs no IO and reports no config changes. Its explicit config-repair and empty state-migration declarations let the host inspect deferred upgrade obligations before replacing the package. Invalid retained settings produce a constant, token-free warning and remain unchanged.

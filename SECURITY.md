# Security

Report vulnerabilities privately through GitHub's private vulnerability reporting for [Baumus/openclaw-unifi](https://github.com/Baumus/openclaw-unifi/security/advisories/new). If that facility is unavailable, file a minimal issue asking for a private reporting channel; do not disclose credentials, network topology or exploit details publicly.

## Trust boundaries and controls

| Boundary | Trusted authority / exposure | Control |
| --- | --- | --- |
| API credential | Host-resolved in-memory snapshot; never agent arguments | SecretRef-only config; declared secretInputs capability; latest snapshot; fail closed |
| UniFi permissions | API key/account/organization rights | No plugin permission filters; use appropriately scoped credentials |
| Agent tool access | OpenClaw core permissions/approvals and user authorization | Separate read/write tools; honest sideEffecting/replaySafe metadata; bundled skill requires exact authorization |
| Agent path/query/body | Untrusted JSON | Official schemas, required fields, no coercion; safe path segments and input bounds before credentials/network |
| Outbound HTTP | Fixed api.ui.com HTTPS only | No arbitrary URL/header override, no redirects/cookies, no TLS disabling, no automatic retries |
| API response | Untrusted and potentially private | Bounded reads, structured error codes, exact-key echo redaction, no logger; response text cannot authorize writes |
| Package resources | Pinned public upstream material | Specification SHA-256 provenance and deterministic coverage/drift tests |

The API token may permit disruptive operations: reboots, firewall/network/Wi-Fi updates, access revocation and deletion. Tool availability or a working key is **not consent**. User authorization for a specific write is separate from service-side token rights. The plugin does not add an independent confirmation-token workflow or assert that it can prevent every inappropriate agent action. Set core tool policy to your needs, particularly for `unifi_request_write`. Generic forwarding does not know endpoint-specific effects beyond the HTTP method.

## Secret storage truth

Use Settings → Secrets → **Protected secret**, not agent-readable environment storage, then set the returned full SecretRef in plugin Settings. OpenClaw's built-in protected store is write-only through UI/tool APIs but **not encrypted at rest**: SQLite is protected by OS `0600`/`0700` permissions. For stronger storage isolation/encryption use an external exec provider. Env/file/exec/store source resolution is host-owned; there is no plugin vault, direct store lookup, shell credential command, .env loader or fallback plaintext config.

SecretRefs prevent plaintext configuration, not compromise of the Gateway process or its owner account. Trusted plugin code receives the resolved credential in process memory. This plugin does not require or enable OpenClaw's optional secret egress proxy.

## Outputs and privacy

Errors never include upstream body/status text, stack traces, response headers, request URLs or supplied credentials. No request/response logging is implemented. Successful responses are returned as JSON; the exact API key and its URL-encoded form are redacted from string values and property names. The sanitizer bounds nesting and work.

Returned UniFi data may include device IDs, MAC/IP addresses, topology, site names, Wi-Fi passphrases or other application secrets. This is an authorized data-access tool, not a universal DLP service; it does not suppress every application credential or infer what should be private. Limit requested data, protect the resulting conversation and treat response content as data, never instructions or authority. No successful-response data is persisted by the plugin.

## Failures and recovery

Fetch, stream and whole-operation deadlines are bounded. Bodies/readers are cancelled on failure. There are no retries, even for reads, 429 or 5xx. Mutating calls can succeed upstream even if a timeout/cancellation/parse/size/transport failure prevents a usable response; failures after successful mutation responses and server errors are marked `outcome: unknown`. Reconcile state before deciding on any further mutation.

No local backup/restore system is implemented because the plugin stores no application state and cannot undo every UniFi operation. Plan network changes and recovery with the operator; do not infer that an API write is reversible.

## Validation and remaining gates

Producer tests use synthetic fixtures for all 87 official methods, schema inheritance, required parameters, traversal/SSRF attempts, no credential access for invalid mutations, redirected/error/oversized/never-ending responses, cancellation/timeouts, no retries, redaction and live snapshot rotation. Dependency audits and package checks are part of the development workflow.

These checks do not establish live UniFi behavior, human authorization quality, correct remote privileges or actual Control UI rendering. Independent review and operator-controlled credentialed installation/GET/UI verification remain separate gates. No live device write is necessary for build/tests.

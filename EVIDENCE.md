# UniFi 0.2.1 performance and setup correction evidence

- Plugin-only changes. No OpenClaw core source, Gateway configuration, permission policy, or real credential is changed by the producer implementation/tests.
- 356/356 producer regression tests pass; exact catalog remains 186 operations / 184 supported REST operations. New cases cover redacted SecretRef readback, interrupted setup resume/repair, live config retention, prepared capability inputs/revision invalidation, deadline bounds, concurrent probes and lazy tool factories.
- Installed 2026.10.5 host reload planner tested in an isolated process: token/config paths no longer replace/drain the plugin; enablement, installation/code, other-plugin changes and explicit lifecycle replacements still reload.
- Official plugin build/check and validate: valid=true, errors=[]. Clean production tarball imports backend and built native browser UI. Runtime dependency audit and final candidate hashes are recorded separately during release.
- Five-process cold-load baseline versus optimized candidate: entry 885 ms -> 408 ms; setup module 681 ms -> 4 ms (medians). These are import timings, not complete live reload/setup timings; see PERFORMANCE.md.
- Prior review identified marker-only resume reconciliation as insufficient. Candidate now obtains a backend sourceMatches boolean for the exact full source reference and marker before skipping config.patch; explicit mismatches use ordinary revision-guarded repair. A targeted regression proves this case.
- Live authentication and applied-version/browser receipts must be verified after deployment. A saved source reference alone does not prove active or working credentials. No token is included in public evidence or test fixtures.

---

# UniFi 0.2.0 one-token onboarding release evidence

- Scope: native UniFi setup page, protected host-owned token storage/binding, read-only connection verification, existing API/tool compatibility.
- Producer: 342/342 tests passed, including 25 focused onboarding/security/DOM cases. OpenClaw plugin validator valid=true; ClawHub inspector pass with 0 issues/warnings. Production tarball imports backend and built native browser UI, and activates setup page/navigation without source-tree lookup.
- Independent targeted review by Alfred: USET-01 and USET-02 CLOSED; independent 25/25 onboarding tests passed; git diff --check clean.
- USET-01: new nonempty token gets fresh protected entry; empty-input resume reconciles saved unique reference; ambiguous write acknowledgement cannot overwrite an existing token. Token-free session recovery expires after one hour.
- USET-02: config patch writes reference and unique generation marker together; backend checks source match plus marker in same stable resolved runtime object as credential, before and after GET. Matched-new-source/stale-old-runtime test fails closed with zero network calls.
- Frozen release archive SHA-256: 6773f8ea396e769c638e30dab3720d5ac8eae9b10b51396e2a30f394d3e3e4d5 (65 packaged files).
- No real UniFi token available. Actual authenticated live connection is untested. Full Control UI browser automation timed out; DOM interaction and packed browser-module activation were tested.
- Security/storage limits and optional host-wide custom native UI gate are documented in README and SECURITY.

---

## Historical 0.1.0 evidence

# UNI-01 bounded review-fix handoff

Status: **READY FOR TARGETED REVERIFICATION** by requesting owner Alfred; producer evidence is not independent approval. No new reviewer or nested review was started. Parent retains provenance (UNI-02), release and final delivery.

Workspace: /home/clawdbot/openclaw-unifi
Fixed review baseline: f34eb7914ec0f5f59b2ecc1a8038b241021880f4
This is one bounded correction pass for independent Alfred finding UNI-01 and subfindings UNI-01a / UNI-01b. All remain open for Alfred's targeted disposition; implementation submitted. No unrelated cleanup or release actions were taken.

## Candidate identity and stale evidence

The new sorted complete file manifest, Git diff/status and receipt are under /tmp/openclaw-unifi-build/. The manifest includes source, generated dist, tests, documentation and pinned specifications, excluding only .git and node_modules. The receipt contains the final manifest and artifact SHA-256, unchanged base commit, coverage and next owner. No commit was created.

The prior 150-test / 87-operation receipt and artifact hash 5f93f7fb23430c5a0da8ba80e9f7eaebd58ca40d80b5d42148e861f83d4dcbfa are **replaced**, not evidence for this candidate. Existing SecretRef and JSON/transport behavior is retained and rerun in regression; its previous release status is not inherited.

Package: @baumus/openclaw-unifi 0.1.0; plugin ID unifi.
Artifact: /tmp/openclaw-unifi-build/baumus-openclaw-unifi-0.1.0.tgz
Final artifact SHA-256 is recorded in the external receipt and completion response. EVIDENCE.md is not a packed resource; its own final content is included in the complete tree manifest.

## Finding dispositions and fix map

| Finding | Disposition | Bounded correction |
| --- | --- | --- |
| UNI-01 | confirmed-blocker; implementation submitted | Inventory all six public services in the official portal. Add Protect 74, InnerSpace 6, Mobility 8 and Carrier Fabric 11 catalog entries with complete schemas. Preserve original 87 Site Manager/Network IDs and routes. Execute all 184 supported REST operations in source-derived synthetic tests |
| UNI-01a | confirmed-blocker; implementation submitted | JPEG/PNG download through bounded transport into private host media; opaque ref/MIME/size only. Binary multipart upload from governed SDK store IDs with MIME/size validation, core write-tool contract, authority checks/cancellation and uncertain-write/no-retry behavior |
| UNI-01b | confirmed-blocker; implementation submitted | Both Protect subscriptions remain discoverable/describable as upstream-unavailable. Native and generic execution fail before credential access. No WebSocket or local-console fallback |
| UNI-02 | parent-owned, untouched | Parent binds publication/source provenance and owns release delivery |

## Changed surface

* src/types.ts, catalog.ts, request.ts, tools.ts: six API identities, namespaced/derived stable IDs, source transport/availability metadata, expanded discover/status/describe, canonical cloud routes and multipart plan.
* src/media.ts (new), client.ts: exported OpenClaw media-store/media-mime SDK only; fixed inbound/unifi namespaces, pinned bounded reads, sniffed allowed MIME, 5 MiB cap, cancellable 30-second upload preparation, single file FormData part, opaque download reference and guarded atomic publication.
* src/schema.ts: normalize Protect's explicitly closed allOf request wrappers by projecting inherited property names onto that closure, preserving required/type constraints and rejecting extras. Original describe metadata remains source-exact.
* scripts/generate-catalog.mjs, specs/: four verbatim added official specs, provenance hashes, deterministic catalog and explicit availability/exclusion inventory.
* test/coverage.test.mjs, fixtures.mjs, runtime.test.mjs, media.test.mjs and original-operations.json: complete execution coverage, invalid mutations, retained ID/route contract, media transport/privacy/authority/MIME/bounds, unavailable subscriptions, actual isolated SDK store tests. The original compatibility fixture is derived from the named review baseline, independent of shallow Git history.
* package.json, src/index.ts, openclaw.plugin.json, scripts/check-package.mjs: public API description, official regenerated metadata and isolated package checks for added resources/media SDK.
* README.md, API_INVENTORY.md, ARCHITECTURE.md, SECURITY.md, skills/unifi/SKILL.md: exact capability/ID/media contracts, upstream limits/exclusions, authorization and honest verification caveats.

## Exact coverage

| API | Catalog | Supported REST | Upstream-unavailable |
| --- | ---: | ---: | ---: |
| Site Manager v1.0.0 | 14 | 14 | 0 |
| Network v10.6.106 | 73 | 73 | 0 |
| Protect v7.3.70 | 74 | 72 | 2 |
| InnerSpace v1.3.23 | 6 | 6 | 0 |
| Mobility v1.0.0 | 8 | 8 | 0 |
| Carrier Fabric v1.0.0 | 11 | 11 | 0 |
| Total | 186 | 184 | 2 |

Catalog verbs: GET 103 (101 supported), POST 36, PUT 15, PATCH 18, DELETE 14. All 83 non-GET operations have invalid-mutation tests proving no credential access or fetch. All 184 supported operations execute through actual tools with source-derived request fixtures and synthetic transport, including both binary download endpoints and the multipart upload endpoint. The five original generic connector operations are included once in Site Manager, not duplicated per application.

Original IDs are unchanged. Added sources use api:sourceOperationId, or api:lowercase-method:exact-path for missing source IDs (Protect and InnerSpace). Complete response/request schemas and referenced components are available even for unavailable operations. No extra REST methods (HEAD/OPTIONS/etc.) were found in the six pinned path inventories.

Official portal inspection additionally found Mobility and Carrier Fabric at api.ui.com, beyond the review's Protect/InnerSpace examples. Protect and InnerSpace bytes supplied by the parent were freshly fetched from the current official version URLs and independently hash-matched. Exact URLs/hashes are in specs/provenance.json. API_INVENTORY.md and specs/availability.json record service-level and protocol exclusions.

## Producer checks

Working directory: /home/clawdbot/openclaw-unifi. Toolchain unchanged: Node v26.12.0, npm 11.20.0, OpenClaw 2026.10.5, TypeScript 5.9.3.

| Command | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS; deterministic 186-entry catalog freshness and TypeScript |
| npm test | PASS: **317 tests**, 0 failed/skipped/cancelled |
| npm run plugin:build | PASS; official host regenerated manifest/package metadata |
| npm run plugin:build:check | PASS; metadata up to date |
| npm run plugin:validate | PASS; valid=true, pluginId=unifi, errors=[] |
| npm run package:check | PASS; 55 packed files, 10 runtime ESM modules; clean production install and isolated runtime import/status/describe/media SDK/resource checks; final digest in receipt |
| npm audit --omit=dev | PASS; 0 vulnerabilities |
| bash /home/clawdbot/.openclaw/skills/security-governance/scripts/secret-scan-lite.sh /home/clawdbot/openclaw-unifi | PASS; no obvious secrets detected |
| npm pack --ignore-scripts --silent --pack-destination /tmp/openclaw-unifi-build | PASS; standard artifact, no publication |
| git diff --check | PASS |

Changed-surface operation/invalid-mutation checks preceded the full justified integration gate. Initial development runs exposed a miscount in a test expectation and Protect's closed-allOf source wrapper; both were corrected without weakening required/type/extra-field checks. One pre-fix test process stalled on an injected SDK read and was terminated; the added cancellation race and subsequent 317-test run passed. These failed/stale runs do not establish candidate success.

Additional meaningful media evidence: all seven advertised MIME families are recognized by the real host detector from synthetic byte signatures; mismatched declarations, missing content type, empty/declared/streamed oversize downloads and bad store inputs fail. Upload cancellation interrupts a never-settling read without credentials or send. 503/transport/invalid-response upload outcomes remain unknown with exactly one send. The isolated real SDK store roundtrip uses only a temporary OPENCLAW_STATE_DIR, verifies private directory permissions and rejects path and symlink escapes. No real host media, user file or remote credential is needed.

## Exclusions, residual risk and unvalidated areas

* Protect GET /v1/subscribe/devices and /v1/subscribe/events are WebSockets unavailable through Cloud Connector. The limitation is review-supplied upstream evidence; current official pages/spec classify them as WebSockets. The older v7.3.60 citation now returns 404, and current v7.3.70 links are recorded. No live WebSocket attempt.
* Access/Talk/Connect/other unlisted products: no public api.ui.com schema contract established in the inspected six-service portal inventory. No guessed operations; this does not claim private/local APIs cannot exist.
* Direct RTSPS/WebRTC/video/audio streaming, private controller routes and local-console alternatives are outside the pinned cloud REST contract. REST endpoints returning stream/talkback metadata remain supported; returned URLs are never followed.
* Protect declares multipart/form-data with a binary-string schema but no part name. The plugin uses one file part named file and a generated safe filename/boundary. Upstream Postman generation has no usable binary-part example. Synthetic transport is verified; exact real-console acceptance of this convention remains unverified.
* Real authentication, API scopes/subscriptions, console/application business behavior, installation/activation, actual Settings interaction and media retention/rendering remain operator-owned and unverified. Signature tests are MIME sniffing, not proof of full codec/image validity.
* Downloaded images are stored privately by the host SDK, under host media lifecycle rules; the plugin does not independently delete them. No bytes/base64/path are sent to the agent. No mutable UniFi configuration state is stored.
* Structured Network filter ambiguity and standard npm/ClawHub package-only distribution remain documented from the prior candidate; no single-bundle plugins pack claim.
* No live host secrets/config were read or changed; no live API call, publication, installation, activation, commit, push, merge, runtime/schedule/routing change or release approval occurred.

Recovery: restore reviewed baseline files or prior package before activation; remove candidate-only files if abandoning the fix. SDK tests clean up their temporary media directory. Never replay uncertain UniFi mutations as recovery.

## Sole next action

Alfred: targeted verification of **UNI-01 / UNI-01a / UNI-01b only**, using this bounded fix diff, exact new receipt and relevant evidence. Do not reopen unchanged code; report new issues only for critical/high blockers directly introduced by the fix with a concrete failure path. Parent retains UNI-02 and publication/final delivery. Producer writes stop after final receipt generation.

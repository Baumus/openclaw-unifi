# Producer evidence handoff

Status: READY FOR INDEPENDENT REVIEW, not release approval.  
Sole next owner: requesting owner Alfred (arrange independent review, then own publication/install/config/user delivery).  
Workspace: /home/clawdbot/openclaw-unifi  
Baseline: directory existed but was empty; no Git repository/baseline was present. All project files are candidate scope. No live configuration or installed plugin was changed.

## Candidate identity

The completion response provides the SHA-256 of a sorted complete file manifest, excluding only node_modules and .git, recorded outside this tree under /tmp/openclaw-unifi-build/. It includes this evidence file, source, generated dist, tests, official specifications and docs. The requester can bind a later Git commit to this exact tree.

Standard npm artifact:
  /tmp/openclaw-unifi-build/baumus-openclaw-unifi-0.1.0.tgz
  SHA-256: 5f93f7fb23430c5a0da8ba80e9f7eaebd58ca40d80b5d42148e861f83d4dcbfa

Package identity: @baumus/openclaw-unifi 0.1.0; plugin unifi. Repository metadata points to https://github.com/Baumus/openclaw-unifi. Nothing was published, installed, activated, tagged, committed, pushed or merged by this implementation session.

## Changed surface and rationale

* src/index.ts, config.ts, tools.ts: focused definePluginEntry SDK registration, five tool contracts, SecretRef-only source config and current runtime snapshot access.
* src/catalog.ts, schema.ts: complete official operation discovery/description, schema-reference closure and non-coercing validation with discriminator/allOf inheritance.
* src/request.ts, client.ts, errors.ts, types.ts: pure pre-credential planning, canonical fixed-origin routing, all five verbs, structured sanitized errors, deadlines/cancellation/bounds, no retries and exact-key redaction.
* specs/: verbatim pinned official Site Manager v1.0.0 and Network v10.6.106, SHA/date provenance and deterministic generated catalog.
* scripts/: catalog generation/freshness; manifest bootstrap; deterministic original icon; isolated standard-package content/runtime verification.
* third_party/unifi-mcp-server/: exact upstream client/connector source and MIT license at 4a3e0163f470496b948bf6e54129dd65a3ebfb4e. Actual request/header/JSON/timeout/204 client code is adapted into src/client.ts; architecture/client concepts are used without spawning MCP.
* openclaw.plugin.json, package.json, package-lock.json, tsconfig.json: complete manifest/contracts/side-effect metadata, narrow host compatibility, production dependencies and modular built ESM distribution.
* test/: source-derived fixtures and meaningful operation/security/transport/runtime checks.
* README, ARCHITECTURE, SECURITY, CONTRIBUTING, LICENSE, NOTICE: accurate community scope, setup/storage truth, security/access matrix, provenance, limits and development.
* skills/unifi/SKILL.md, assets/: discover → describe → request workflow and explicit-write-authorization guidance; portable icon PNG/SVG and monochrome activity SVG.
* .github/workflows/ci.yml, .gitignore: reproducible producer gates and generated/dependency exclusions.

## Reproducible producer checks

Working directory: /home/clawdbot/openclaw-unifi.

| Command | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run build | PASS; catalog freshness then TypeScript emission |
| npm test | PASS: 150 tests, 0 failed/skipped/cancelled |
| npm run plugin:build | PASS: official OpenClaw manifest/package generation |
| npm run plugin:build:check | PASS: Plugin metadata is up to date |
| npm run plugin:validate | PASS: valid=true, pluginId=unifi, errors=[] |
| npm run package:check | PASS: 46 packed files, 9 runtime ESM modules; clean production dependency install, extracted runtime import and local status |
| npm audit --omit=dev | PASS: 0 vulnerabilities |
| bash /home/clawdbot/.openclaw/skills/security-governance/scripts/secret-scan-lite.sh /home/clawdbot/openclaw-unifi | PASS: No obvious secrets detected; excludes node_modules/.git by scanner policy |
| npm pack --ignore-scripts --silent --pack-destination /tmp/openclaw-unifi-build | PASS: standard artifact above |

Toolchain: Node v26.12.0, npm 11.20.0, OpenClaw 2026.10.5 (1b58cb9), TypeScript 5.9.3. Local SDK uses a symlink to the installed host; the package declares the exact host peer and real runtime dependencies. CI is authored for Node 24.16.0 and the same host version, but has not yet run on GitHub.

An initial package-isolation probe attempted a non-exported OpenClaw package.json subpath. It was corrected to resolve the exported focused plugin-entry SDK subpath, and the repeated isolated package check passed. Earlier implementation-time compile/fixture/metadata failures were corrected before the final green run; no failing check remains.

## Covered criteria and failure classes

* Exact official coverage: Site Manager 14 + Network 73 = 87. GET 50, POST 14, PUT 10, PATCH 2, DELETE 11. Each operation executes through its real tool with an independent original-spec-derived request fixture and mocked fetch.
* All five generic connector methods execute with the proper method; non-GET bodies are not dropped or downgraded. Network uses the official /v1/connector/consoles/{consoleId}/proxy/network/integration prefix.
* All 37 non-GET operations have malformed mutation cases proving zero runtime credential reads and zero network calls.
* Complete describe reference/discriminator closure; required body/path/query envelopes; allOf subtype preservation; oneOf/nullable semantics; format/integer/range checks; literal hostIds[] repeated arrays; numeric port paths; pagination-token preservation.
* Wrong read/write surface, unknown/irrelevant fields, absent required query values, malformed JSON/prototypes/accessors/cycles/size/depth, hostile paths and arbitrary URL/header arguments.
* Fixed-origin transport and redirect rejection; no retries on 4xx/429/5xx; sanitized upstream/exception errors; 204, oversize declared/streaming responses, malformed JSON, cancellation before/in-flight, deadlines on stalled fetch/body, stream cleanup and live authority guard.
* API-key echo redaction in strings/keys; SecretRef-only source validation; declared sensitive capability contract; current snapshot rotation and no fallback from unavailable/removed snapshots; discovery without credentials.
* Artifact runtime/resources/licenses/artwork/skill contents and clean production dependency shape.

## Deliberate scope and residual verification

* No real credential, private host config, house data, raw logs or secret store was accessed. All tests are synthetic. Real UniFi authentication, service/console behavior, actual installation/activation and Settings rendering/interaction remain unverified and belong to the requester/operator.
* Generic forwarding validates the transport envelope, not the schemas/effects of every application. Binary streaming, WebSockets, legacy private controller APIs and comprehensive non-Network ecosystem schema coverage are not implemented or claimed.
* OAS form object serialization is defined for scalar property values; nested object form values are rejected. The official getDeviceTagPage.filter structured schema differs from ordinary textual Network filters. Docs describe using the official generic connector for the actual application's textual DSL rather than silent coercion.
* POST queryISPMetrics is conservatively classified as side-effecting/non-replay-safe with other non-GET methods.
* Protected-store values are not encrypted at rest; the docs recommend an external exec SecretRef provider when encryption/isolation is required. No bespoke vault or egress proxy is introduced.
* No independent review or release verdict is claimed. Security documentation contains the proportional trust/access matrix and AI input/output/write boundaries; backup/restore execution is not applicable to this no-persisted-application-state implementation.
* Standard npm/ClawHub packages with resource files are supported. The host's single-bundle plugins pack activation format is not supported by this resource-file layout, per the requester's distribution decision.

Recovery: remove/restore this bounded candidate tree or the prior reviewed package before activation. No live effects need rollback from this work. Never replay uncertain UniFi writes as recovery.

Requested next action: independently review this frozen candidate, then let Alfred own any publication/install/credentialed GET/UI validation and user delivery. Stop writes after handoff.

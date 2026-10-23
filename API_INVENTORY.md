# Official public API inventory

Inspected 2026-10-23 using the public [developer portal](https://developer.ui.com/). Its service selector advertises exactly Network, Protect, Mobility, InnerSpace, Site Manager and Carrier Fabric. All six published specifications are pinned byte-for-byte in `specs/`; URLs, retrieval times and SHA-256 are in `specs/provenance.json`. Machine-readable availability/exclusions: `specs/availability.json`.

| Specification | GET | POST | PUT | PATCH | DELETE | Catalog | Supported REST |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [Site Manager v1.0.0](https://developer.ui.com/site-manager/v1.0.0/openapi.json) | 9 | 2 | 1 | 1 | 1 | 14 | 14 |
| [Network v10.6.106](https://developer.ui.com/network/v10.6.106/openapi.json) | 41 | 12 | 9 | 1 | 10 | 73 | 73 |
| [Protect v7.3.70](https://developer.ui.com/protect/v7.3.70/openapi.json) | 38 | 19 | 0 | 15 | 2 | 74 | 72 |
| [InnerSpace v1.3.23](https://developer.ui.com/innerspace/v1.3.23/openapi.json) | 6 | 0 | 0 | 0 | 0 | 6 | 6 |
| [Mobility v1.0.0](https://developer.ui.com/mobility/v1.0.0/openapi.json) | 5 | 0 | 3 | 0 | 0 | 8 | 8 |
| [Carrier Fabric v1.0.0](https://developer.ui.com/carrier-fabric/v1.0.0/openapi.json) | 4 | 3 | 2 | 1 | 1 | 11 | 11 |
| Total | 103 | 36 | 15 | 18 | 14 | 186 | 184 |

The original 87 Site Manager/Network IDs are unchanged. Every added operation is namespaced: `<api>:<sourceOperationId>`, or, where the source has no ID (Protect/InnerSpace), `<api>:<lowercase-method>:<exact-OAS-path>`. Example: `protect:get:/v1/cameras/{id}/snapshot`. These IDs are deterministic, version-independent and collision-checked; the source operation ID, when present, is separately exposed. Discover/describe include complete original request/response metadata and transitive schema references, including unavailable subscriptions.

## Transport

Network, Protect and InnerSpace use the first official server: `https://api.ui.com/v1/connector/consoles/{consoleId}/proxy/<application>/integration` plus the exact source path. Site Manager, Mobility and Carrier Fabric use `https://api.ui.com` plus their already-versioned source paths. No host, local-controller address or application server is agent-configurable.

API keys are used only on the remote external api.ui.com deployment. Scope/account/organization/subscription/device-version limitations remain upstream requirements. Mobility PUT replaces the entire target resource: follow its official read-modify-write instructions and obtain exact write authorization.

## Binary REST operations

* Protect GET `/v1/cameras/{id}/snapshot`: bounded JPEG download.
* InnerSpace GET `/v1/assets/{planId}/{filename}`: bounded JPEG/PNG download.
* Protect POST `/v1/files/{fileType}`: bounded multipart upload. The pinned fileType enum currently permits `animations` only. Source MIME list: image/gif, image/jpeg, image/png, audio/mpeg, audio/mp4, audio/wave, audio/x-caf. The schema declares a binary multipart body but no part name; the plugin sends one file part named `file` with generated filename and a fetch-generated boundary. The generated upstream Postman collection does not supply a usable binary-part example. Actual server acceptance of this part-name convention remains an operator verification item, not a live claim.
* The SDK media store owns file ingress, private directories and guarded publication; only store IDs, never agent URLs or paths, are accepted. See README media examples and SECURITY.

## Explicit exclusions and reasons

| Surface | Upstream reason / disposition |
| --- | --- |
| Protect GET `/v1/subscribe/devices` | WebSocket, unavailable through Cloud Connector; discover/describe only; native and generic execution fail before credential access |
| Protect GET `/v1/subscribe/events` | Same; no local/home-network fallback |
| Direct RTSPS/WebRTC/video/audio streaming | Outside Cloud Connector REST transport; the REST endpoints that create/list/delete stream or talkback-session metadata **are** supported. Returned URLs are untrusted data and are never fetched |
| Access, Talk, Connect, other unlisted products | No public api.ui.com OpenAPI contract established in the six-service official portal inventory; not guessed or silently counted. Private/local APIs may exist |
| Legacy private controller routes and local-console alternatives | Outside the public api.ui.com contract; never used as fallback |

Subscription sources: [devices](https://developer.ui.com/protect/v7.3.70/get-v1subscribedevices), [events](https://developer.ui.com/protect/v7.3.70/get-v1subscribeevents). Cloud Connector unavailability is the upstream limitation supplied by independent Alfred review (UNI-01b); the current pages/spec classify them as WebSocket subscriptions. The review's older v7.3.60 page now returns 404, so current-version links are recorded here. No WebSocket attempt or live service validation was performed.

Coverage means the pinned documented contracts, not a guarantee about every present/future UniFi product or capability. All producer execution tests are synthetic.

# UniFi 0.2.1 setup and reload performance

## Root causes addressed

- No plugin-owned live-config policy: credential/limit changes defaulted to full plugin replacement and admitted-work drain. A relevant pre-fix config patch took 107,871 ms; this is an observed end-to-end operation, not a pure plugin execution time.
- Browser verification compared `config.get` SecretRef IDs although that public readback can redact IDs. This could reject a successful save. The backend now remains the authoritative binding verifier, with a read-only source-match check for resume repair.
- Eager entry imports loaded API/schema/media and host snapshot machinery during registration. Implementations and heavyweight SDK surfaces now load only on use.
- Setup fetched the default site page with the normal 30-second network deadline. It now requests one site and caps network wait at 8 seconds, preserving a shorter configured deadline. Concurrent probes coalesce only within the exact runtime/prepared-secret generation; completed authentication results are never cached.
- Capability-owned references are consumed through the host-prepared invocation credential SDK when the call's config view is not already resolved. No direct credential resolution or host security-policy change is introduced.

## Measured cold-process import latency

Five fresh Node processes per module and version on the same host; medians. Baseline: source commit `d39a2d689dc8fd20f8acb75c7797d86410e9d40d` (0.2.0). These are module import times, not total Gateway reload or UniFi latency.

| Module | 0.2.0 | Optimized |
| --- | ---: | ---: |
| Plugin entry | 885 ms | 408 ms |
| Setup module | 681 ms | 4 ms |

Reproduce with `npm run benchmark:startup`. Host SDK work shifts to the first relevant invocation; it is not removed or bypassed. Fresh successful setup uses five RPCs instead of six; resume may add a read-only source-binding check and never blindly replays a write.

## Verification

`npm test` covers API compatibility, redacted readback, resume repair, prepared capability credentials, stale-source/runtime rejection, revision changes, concurrency, cancellation and secure DOM behavior. `npm run test:host-reload` runs the actual installed 2026.10.5 planner in an isolated process with synthetic registry data: config/token changes are no-op runtime publications; code install, enablement, other plugins and explicit lifecycle actions still reload. No live Gateway state or core files are modified by that check.

A full code installation/reload still needs the host to release admitted work safely. This plugin does not terminate runs or bypass that drain. Authentication is not established by a saved reference, package validation, or these synthetic performance tests; verify the loaded version and a real read-only connection separately.

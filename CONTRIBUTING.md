# Contributing

Use Node 24.16+ (or 26.1+) and the exact OpenClaw 2026.10.5 SDK. See README development commands. Keep changes focused, ESM and modular; runtime imports must be declared production dependencies or focused OpenClaw SDK subpaths.

## API updates

1. Fetch a specifically versioned public official specification over HTTPS into a new file under `specs/`; do not fetch private controller definitions or house data.
2. Record the official URL, exact SHA-256 and UTC retrieval date in `specs/provenance.json`.
3. Update source filenames/versions in `scripts/generate-catalog.mjs`, regenerate with `npm run catalog:generate`, inspect the diff, then `npm run catalog:check`.
4. Extend validators/serialization if new documented features require it. Fail generation clearly for unsupported media/parameter forms; never add a catalog operation that cannot run.
5. Update coverage assertions/docs for the complete new operation counts. Add meaningful failure cases for changed behavior.
6. Run typecheck, tests, plugin:build, plugin:build:check, plugin:validate, package:check and dependency audit. Review generated fields after regeneration, especially tool contracts and side-effect metadata.

The checked-in upstream originals under `third_party/unifi-mcp-server` are provenance, not executable plugin modules. Preserve their license and pinned commit when adapting more code. Keep original code covered by its original MIT notice.

## Host compatibility and metadata

The SDK is experimental. Do not broaden peer/compatibility ranges without actually testing that host version. `src/index.ts` uses definePluginEntry plus the SDK's exported tool metadata contract. Official `openclaw plugins build` maintains generated configSchema/tool metadata; hand-maintained secretInputs/uiHints/skills/artwork must survive it. `scripts/write-manifest.mjs` is the source bootstrap for owned non-generated manifest fields.

No publishing, release tagging, activation, config changes or credentialed writes are part of CI. Publishing/installing are owner actions after independent review. Standard npm/ClawHub resource-bearing packages are the supported distribution format, not the host's single-bundle activation pack.

## Security and tests

Do not submit keys, raw host config, network/customer data or private logs. Use synthetic fixture names and mock fetch. Test invalid writes before credentials/network, exact canonical route/serialization, subtype fields, cancellation/byte bounds, structured errors and no retries. Treat API response content as untrusted. See SECURITY.md for private reports.

## Complete release builds

`npm run build` removes `dist`, checks the pinned catalog, compiles current runtime modules, and builds native Control UI assets and metadata using the official host CLI. `npm pack` runs that complete build through `prepack`. Do not use `npm pack --ignore-scripts` on an unbuilt tree. `npm run package:check` rejects removed runtime modules and inactive hashed UI generations in the tarball. This package hygiene does not substitute for a completed ClawHub security scan.

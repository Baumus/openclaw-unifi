import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packagePath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const sdkEntry = import.meta.resolve('openclaw/plugin-sdk/plugin-entry');
const host = JSON.parse(readFileSync(new URL('../../package.json', sdkEntry), 'utf8'));
// The supported-host range can cover more than one SDK; record the SDK actually used.
pkg.openclaw.build = { openclawVersion: host.version, pluginSdkVersion: host.version };
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
// Build one complete artifact. Old hashed UI bundles and removed runtime modules
// must not survive a rebuild or be shipped by npm's recursive dist inclusion.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
for (const [command, args] of [
  [process.execPath, ['scripts/generate-catalog.mjs', '--check']],
  ['tsc', []],
  ['openclaw', ['plugins', 'build', '--root', '.', '--entry', './dist/index.js']],
]) execFileSync(command, args, { cwd: root, stdio: ['inherit', 2, 2] });

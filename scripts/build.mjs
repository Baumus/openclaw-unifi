import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Build one complete artifact. Old hashed UI bundles and removed runtime modules
// must not survive a rebuild or be shipped by npm's recursive dist inclusion.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
for (const [command, args] of [
  [process.execPath, ['scripts/generate-catalog.mjs', '--check']],
  ['tsc', []],
  ['openclaw', ['plugins', 'build', '--root', '.', '--entry', './dist/index.js']],
]) execFileSync(command, args, { cwd: root, stdio: ['inherit', 2, 2] });

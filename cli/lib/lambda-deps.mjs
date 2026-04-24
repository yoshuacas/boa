import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './aws.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAMBDA_DIR = join(__dirname, '..', 'templates', 'lambda');

function parsePinnedTag(spec) {
  // e.g. "github:yoshuacas/pgrest-lambda#v0.2.0" → "v0.2.0"
  const idx = spec.indexOf('#');
  return idx === -1 ? null : spec.slice(idx + 1);
}

function readInstalledVersion() {
  const pkg = join(LAMBDA_DIR, 'node_modules', 'pgrest-lambda', 'package.json');
  if (!existsSync(pkg)) return null;
  return `v${JSON.parse(readFileSync(pkg, 'utf8')).version}`;
}

// Install lambda dependencies only when the installed pgrest-lambda
// version does not match the version pinned in package.json. Keeps
// `boa deploy` fast on the common case and re-installs on CLI upgrade.
export function ensureLambdaDepsInstalled() {
  const pkg = JSON.parse(
    readFileSync(join(LAMBDA_DIR, 'package.json'), 'utf8')
  );
  const pinned = parsePinnedTag(pkg.dependencies['pgrest-lambda']);
  const installed = readInstalledVersion();
  if (installed && pinned && installed === pinned) return;

  const label = pinned || 'dependencies';
  console.log(`Installing pgrest-lambda ${label}...`);
  run('npm ci', { cwd: LAMBDA_DIR });
}

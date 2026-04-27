import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './aws.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAMBDA_DIR = join(__dirname, '..', 'templates', 'lambda');

export function parsePinnedVersion(spec) {
  // BOA pins pgrest-lambda to an exact npm version so
  // generated backends are reproducible across CLI installs.
  return /^\d+\.\d+\.\d+$/.test(spec) ? spec : null;
}

export function getPinnedPgrestLambdaVersion() {
  const pkg = JSON.parse(
    readFileSync(join(LAMBDA_DIR, 'package.json'), 'utf8')
  );
  const pinned = parsePinnedVersion(pkg.dependencies['pgrest-lambda']);
  if (!pinned) {
    throw new Error(
      'pgrest-lambda must be pinned to an exact npm version'
    );
  }
  return pinned;
}

function readInstalledVersion() {
  const pkg = join(LAMBDA_DIR, 'node_modules', 'pgrest-lambda', 'package.json');
  if (!existsSync(pkg)) return null;
  return JSON.parse(readFileSync(pkg, 'utf8')).version;
}

// Install lambda dependencies only when the installed pgrest-lambda
// version does not match the exact version pinned in package.json.
// Keeps `boa deploy` fast on the common case and re-installs on CLI
// upgrade.
export function ensureLambdaDepsInstalled() {
  const pinned = getPinnedPgrestLambdaVersion();
  const installed = readInstalledVersion();
  if (installed && installed === pinned) return;

  console.log(`Installing pgrest-lambda ${pinned}...`);
  run('npm ci', { cwd: LAMBDA_DIR });
}

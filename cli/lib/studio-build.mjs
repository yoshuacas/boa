/**
 * studio-build.mjs
 *
 * Downloads the BOA repo archive from GitHub (public, no token required),
 * extracts the studio/ subdirectory, runs npm ci + vite build + lambda build,
 * and returns paths to:
 *   spaDir     — path to dist/ (SPA static files → upload to S3)
 *   lambdaZip  — path to lambda.zip (API handler → upload to S3 artifacts)
 *   cleanup    — call when done to remove the temp directory
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const DEFAULT_REPO = 'yoshuacas/boa';

/**
 * @param {object} opts
 * @param {string} [opts.repo]                 GitHub repo (default: 'yoshuacas/boa')
 * @param {string} [opts.ref]                  Git branch or tag (default: 'main')
 * @param {string} [opts.authMode]             'token' | 'cognito'
 * @param {string} [opts.cognitoRegion]        AWS region of Cognito pool
 * @param {string} [opts.cognitoUserPoolId]    Cognito User Pool ID
 * @param {string} [opts.cognitoClientId]      Cognito App Client ID
 */
export async function buildStudio({
  repo = DEFAULT_REPO,
  ref = 'main',
  authMode = 'token',
  cognitoRegion,
  cognitoUserPoolId,
  cognitoClientId,
} = {}) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'boa-studio-build-'));

  try {
    // 1. Download repo archive (public, no token)
    const archiveUrl = `https://github.com/${repo}/archive/refs/heads/${ref}.zip`;
    const archivePath = join(tmpDir, 'boa.zip');
    process.stdout.write(`  Downloading ${archiveUrl} ...\n`);
    await downloadFile(archiveUrl, archivePath);

    // 2. Extract
    execSync(`unzip -q ${shellEscape(archivePath)} -d ${shellEscape(tmpDir)}`);

    // GitHub replaces '/' with '-' in branch names for the extracted directory name.
    const repoName = repo.split('/').pop();
    const { readdirSync } = await import('node:fs');
    const extractedRoot = readdirSync(tmpDir)
      .find((d) => d.startsWith(repoName + '-') && !d.endsWith('.zip'));
    if (!extractedRoot) throw new Error(`Could not find extracted directory in ${tmpDir}`);
    const extractedStudio = join(tmpDir, extractedRoot, 'studio');

    // 3. Install dependencies
    process.stdout.write('  Running npm ci ...\n');
    execSync('npm ci', { cwd: extractedStudio, stdio: 'inherit' });

    // 4. Build SPA (Vite)
    process.stdout.write('  Running vite build (SPA) ...\n');
    execSync('npm run build', { cwd: extractedStudio, stdio: 'inherit' });

    // 5. Build Lambda (esbuild)
    process.stdout.write('  Building Lambda handler ...\n');
    mkdirSync(join(extractedStudio, '.lambda'), { recursive: true });
    execSync('npm run build:lambda', { cwd: extractedStudio, stdio: 'inherit' });

    // 6. Zip Lambda output
    const lambdaDir = join(extractedStudio, '.lambda');
    const lambdaZip = join(tmpDir, 'lambda.zip');
    process.stdout.write('  Zipping Lambda handler ...\n');
    execSync(`cd ${shellEscape(lambdaDir)} && zip -r ${shellEscape(lambdaZip)} .`);

    const spaDir = join(extractedStudio, 'dist');

    return {
      spaDir,
      lambdaZip,
      cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
    };
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  const ws = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body), ws);
}

function shellEscape(val) {
  return "'" + String(val).replace(/'/g, "'\\''") + "'";
}

/**
 * studio-build.mjs
 *
 * Downloads the BOA repo archive from GitHub (public, no token required),
 * extracts the studio/ subdirectory, runs npm ci + open-next build, and
 * zips the resulting Lambda server function.
 *
 * Returns { assetsDir, lambdaZip, cleanup } where:
 *   assetsDir  — path to .open-next/assets/ (upload to S3 static bucket)
 *   lambdaZip  — path to the Lambda zip file (upload to S3 artifacts bucket)
 *   cleanup    — call when done to remove the temp directory
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, createWriteStream } from 'node:fs';
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
 * @param {string} [opts.cognitoUserPoolId]    Cognito User Pool ID (baked at build time)
 * @param {string} [opts.cognitoClientId]      Cognito App Client ID (baked at build time)
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
    // Find the studio/ subdirectory dynamically rather than guessing the name.
    const repoName = repo.split('/').pop();
    const { readdirSync } = await import('node:fs');
    const extractedRoot = readdirSync(tmpDir)
      .find((d) => d.startsWith(repoName + '-') && !d.endsWith('.zip'));
    if (!extractedRoot) throw new Error(`Could not find extracted directory in ${tmpDir}`);
    const extractedStudio = join(tmpDir, extractedRoot, 'studio');

    // 3. Install dependencies
    process.stdout.write('  Running npm ci ...\n');
    execSync('npm ci', { cwd: extractedStudio, stdio: 'inherit' });

    // 4. Build environment — NEXT_PUBLIC_* vars are baked at build time
    const buildEnv = {
      ...process.env,
      NEXT_PUBLIC_STUDIO_MODE: 'cloud',
      NEXT_PUBLIC_STUDIO_AUTH: authMode,
      NEXT_PUBLIC_STUDIO_COGNITO_REGION: cognitoRegion || process.env.AWS_REGION || 'us-east-1',
      NEXT_PUBLIC_STUDIO_COGNITO_USER_POOL_ID: cognitoUserPoolId || '',
    };
    // Also set the non-public vars so next.config.ts env mapping picks them up
    if (cognitoRegion)     buildEnv.STUDIO_COGNITO_REGION     = cognitoRegion;
    if (cognitoUserPoolId) buildEnv.STUDIO_COGNITO_USER_POOL_ID = cognitoUserPoolId;
    if (cognitoClientId)   buildEnv.STUDIO_COGNITO_CLIENT_ID    = cognitoClientId;

    // 5. open-next build
    process.stdout.write('  Running open-next build ...\n');
    execSync('npx open-next build', { cwd: extractedStudio, stdio: 'inherit', env: buildEnv });

    const openNextDir    = join(extractedStudio, '.open-next');
    const assetsDir      = join(openNextDir, 'assets');
    const serverFnDir    = join(openNextDir, 'server-functions', 'default');

    // 6. Zip server function contents (not the directory itself)
    const lambdaZip = join(tmpDir, 'lambda.zip');
    process.stdout.write('  Zipping server function ...\n');
    execSync(`cd ${shellEscape(serverFnDir)} && zip -r ${shellEscape(lambdaZip)} .`);

    return {
      assetsDir,
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

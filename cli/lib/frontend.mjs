import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

export function detectFramework(dir) {
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    if (all.vite) return 'vite';
    if (all.next) return 'next';
    if (all['react-scripts']) return 'cra';
    return null;
  }
  if (existsSync(join(dir, 'index.html'))) return 'static';
  return null;
}

const BUILD_CONFIG = {
  vite: { cmd: 'npx vite build', outDir: 'dist' },
  next: { cmd: 'npx next build && npx next export', outDir: 'out' },
  cra: { cmd: 'npx react-scripts build', outDir: 'build' },
};

export const _internal = { exec: execSync };

export function buildFrontend(dir, framework) {
  const resolved = resolve(dir);
  if (framework === 'static') return resolved;

  const config = BUILD_CONFIG[framework];
  if (!config) throw new Error(`Unknown framework: ${framework}`);

  const outDir = join(resolved, config.outDir);

  try {
    _internal.exec(config.cmd, { cwd: resolved, stdio: 'pipe' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Build failed: ${stderr}`);
  }
  return outDir;
}

export function scanBundleForSecrets() {
  throw new Error('not implemented');
}

export function findSourceMaps() {
  throw new Error('not implemented');
}

export function validateHeaders() {
  throw new Error('not implemented');
}

export function writeRuntimeConfig() {
  throw new Error('not implemented');
}

export function writeAmplifyHeaders() {
  throw new Error('not implemented');
}

export function registerOrigin() {
  throw new Error('not implemented');
}

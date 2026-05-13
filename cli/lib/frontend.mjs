import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
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

function listFilesRecursive(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function isBinary(filePath) {
  const fd = readFileSync(filePath, { length: 8192 });
  const chunk = fd.subarray(0, 8192);
  return chunk.includes(0);
}

function base64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

function findLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function makeSnippet(content, index) {
  const start = Math.max(0, index - 20);
  const end = Math.min(content.length, index + 40);
  return content.slice(start, end);
}

export function scanBundleForSecrets(distDir, knownSecrets = {}) {
  if (!existsSync(distDir)) {
    throw new Error(`Build output directory not found: ${distDir}`);
  }

  const files = listFilesRecursive(distDir);
  const results = [];

  const serviceRoleKey = knownSecrets.serviceRoleKey;
  const jwtSecret = knownSecrets.jwtSecret || knownSecrets.JWT_SECRET;

  for (const filePath of files) {
    if (isBinary(filePath)) continue;

    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      console.warn(`Warning: could not read ${filePath}, skipping`);
      continue;
    }

    const relFile = relative(distDir, filePath);

    if (serviceRoleKey && content.includes(serviceRoleKey)) {
      const idx = content.indexOf(serviceRoleKey);
      results.push({
        file: relFile,
        line: findLineNumber(content, idx),
        pattern: 'serviceRoleKey',
        snippet: makeSnippet(content, idx),
      });
    }

    if (jwtSecret && content.includes(jwtSecret)) {
      const idx = content.indexOf(jwtSecret);
      results.push({
        file: relFile,
        line: findLineNumber(content, idx),
        pattern: 'jwt_secret',
        snippet: makeSnippet(content, idx),
      });
    }

    const awsKeyRe = /AKIA[0-9A-Z]{16}/g;
    let m;
    while ((m = awsKeyRe.exec(content)) !== null) {
      if (m[0].length !== 20) continue;
      results.push({
        file: relFile,
        line: findLineNumber(content, m.index),
        pattern: 'aws_access_key',
        snippet: makeSnippet(content, m.index),
      });
    }

    const awsSecretRe = /(aws_secret_access_key|secretAccessKey).{0,20}[A-Za-z0-9/+=]{40}/g;
    while ((m = awsSecretRe.exec(content)) !== null) {
      results.push({
        file: relFile,
        line: findLineNumber(content, m.index),
        pattern: 'aws_secret_key',
        snippet: makeSnippet(content, m.index),
      });
    }

    const pemRe = /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/g;
    while ((m = pemRe.exec(content)) !== null) {
      results.push({
        file: relFile,
        line: findLineNumber(content, m.index),
        pattern: 'private_key',
        snippet: makeSnippet(content, m.index),
      });
    }

    const jwtRe = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
    while ((m = jwtRe.exec(content)) !== null) {
      const token = m[0];
      const parts = token.split('.');
      if (parts.length < 2) continue;
      try {
        const payload = JSON.parse(base64urlDecode(parts[1]));
        const role = payload.role;
        if (role && role !== 'anon' && role !== 'authenticated') {
          results.push({
            file: relFile,
            line: findLineNumber(content, m.index),
            pattern: 'service_role_jwt',
            snippet: makeSnippet(content, m.index),
          });
        }
      } catch {
        // not valid JSON payload, skip
      }
    }
  }

  return results;
}

export function findSourceMaps(distDir) {
  if (!existsSync(distDir)) {
    throw new Error(`Build output directory not found: ${distDir}`);
  }

  const files = listFilesRecursive(distDir);
  return files
    .filter((f) => f.endsWith('.map'))
    .map((f) => relative(distDir, f));
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

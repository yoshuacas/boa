import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execSync } from 'node:child_process';
import * as config from './config.mjs';

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
  cra: { cmd: 'npx react-scripts build', outDir: 'build' },
};

function nextHasStaticExport(dir) {
  const candidates = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
  for (const name of candidates) {
    const p = join(dir, name);
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      if (/output\s*:\s*['"]export['"]/.test(content)) return true;
    }
  }
  return false;
}

export const _internal = { exec: execSync };

export function buildFrontend(dir, framework) {
  const resolved = resolve(dir);
  if (framework === 'static') return resolved;

  if (framework === 'next') {
    if (!nextHasStaticExport(resolved)) {
      throw new Error(
        "Next.js project does not have static export enabled. " +
        "Add `output: 'export'` to your next.config.js so the " +
        "build produces `out/` instead of `.next/`. Amplify " +
        "Hosting only serves static files."
      );
    }
    try {
      _internal.exec('npx next build', { cwd: resolved, stdio: 'pipe' });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : err.message;
      throw new Error(`Build failed: ${stderr}`);
    }
    return join(resolved, 'out');
  }

  const cfg = BUILD_CONFIG[framework];
  if (!cfg) throw new Error(`Unknown framework: ${framework}`);

  const outDir = join(resolved, cfg.outDir);

  try {
    _internal.exec(cfg.cmd, { cwd: resolved, stdio: 'pipe' });
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

export function validateHeaders(filePath, cfg) {
  if (cfg?.frontend?.suppressHeaderWarnings) return [];

  const warnings = [];

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, 'utf8');
    const cspMatch = content.match(/Content-Security-Policy[\s\S]*?value:\s*["']?(.*?)["']?\s*$/m);
    if (cspMatch) {
      const cspValue = cspMatch[1];
      if (!cspValue.includes('frame-ancestors')) {
        warnings.push(
          "Your amplify-headers.yaml overrides Content-Security-Policy but removes 'frame-ancestors'. The default value blocks clickjacking."
        );
      }
      if (/script-src[^;]*'unsafe-inline'/.test(cspValue)) {
        warnings.push(
          "CSP includes 'unsafe-inline' for script-src, which weakens XSS protection."
        );
      }
    }
  } else if (filePath.endsWith('.html') || existsSync(filePath)) {
    if (!existsSync(filePath)) return [];
    const html = readFileSync(filePath, 'utf8');
    const scriptRe = /<script\s[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = scriptRe.exec(html)) !== null) {
      const url = match[1];
      if (!url.startsWith('http')) continue;
      const tag = match[0];
      if (!tag.includes('integrity')) {
        warnings.push(
          `index.html loads scripts without integrity hashes: ${url}. Without subresource integrity, a compromised CDN can serve modified code.`
        );
      }
    }
  }

  return warnings;
}

export function writeRuntimeConfig(distDir, cfg) {
  const config = {
    apiUrl: cfg.apiUrl,
    anonKey: cfg.anonKey,
    ...(cfg.storageUrl && { storageUrl: cfg.storageUrl }),
    ...(cfg.bucketName && !cfg.storageUrl && {
      storageUrl: `https://${cfg.bucketName}.s3.${cfg.region}.amazonaws.com`,
    }),
    authProvider: cfg.authProvider || 'better-auth',
  };

  const filePath = join(distDir, 'config.json');
  writeFileSync(filePath, JSON.stringify(config, null, 2));
  return { path: filePath, cacheControl: 'no-cache, must-revalidate' };
}

export function writeAmplifyHeaders(distDir, cfg) {
  const apiUrl = cfg.apiUrl || '';
  const storageUrl = cfg.storageUrl || '';
  const cspConfig = cfg.frontend?.csp || {};

  const connectSrc = ["'self'", apiUrl, ...(cspConfig.connectSrc || [])]
    .filter(Boolean)
    .join(' ');
  const imgSrc = ["'self'", 'data:', storageUrl, ...(cspConfig.imgSrc || [])]
    .filter(Boolean)
    .join(' ');
  const scriptSrc = ["'self'", ...(cspConfig.scriptSrc || [])]
    .filter(Boolean)
    .join(' ');

  const csp = [
    "default-src 'self'",
    `connect-src ${connectSrc}`,
    `img-src ${imgSrc}`,
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const yaml = `customHeaders:
  - pattern: '**/*'
    headers:
      - key: 'Strict-Transport-Security'
        value: 'max-age=31536000; includeSubDomains'
      - key: 'X-Content-Type-Options'
        value: 'nosniff'
      - key: 'X-Frame-Options'
        value: 'DENY'
      - key: 'Referrer-Policy'
        value: 'strict-origin-when-cross-origin'
      - key: 'Permissions-Policy'
        value: 'camera=(), microphone=(), geolocation=()'
      - key: 'Content-Security-Policy'
        value: '${csp}'
`;

  const outPath = join(distDir, 'amplify-headers.yaml');
  writeFileSync(outPath, yaml);
  return outPath;
}

export function registerOrigin(origin, projectDir = process.cwd()) {
  const cfg = config.read(projectDir) || {};
  if (!Array.isArray(cfg.allowedOrigins)) {
    cfg.allowedOrigins = [];
  }

  const normalized = origin.replace(/\/+$/, '');
  const added = [];
  const existing = [];

  if (cfg.allowedOrigins.includes(normalized)) {
    existing.push(normalized);
  } else {
    cfg.allowedOrigins.push(normalized);
    added.push(normalized);
  }

  cfg.allowedOrigins = [...new Set(cfg.allowedOrigins)];
  config.write(cfg, projectDir);

  return { added, existing };
}

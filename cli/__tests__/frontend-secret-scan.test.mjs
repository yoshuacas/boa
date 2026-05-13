import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanBundleForSecrets } from '../lib/frontend.mjs';

let tempDir;

function makeTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'boa-secret-scan-'));
  return tempDir;
}

function writeFile(dir, name, content) {
  writeFileSync(join(dir, name), content);
}

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = Buffer.from('fakesignature').toString('base64url');
  return `${header}.${body}.${sig}`;
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('scanBundleForSecrets', () => {
  describe('positive detections', () => {
    it('detects literal serviceRoleKey value', () => {
      const dir = makeTempDir();
      const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake';
      writeFile(dir, 'app.js', `const key = "${serviceRoleKey}";`);
      const results = scanBundleForSecrets(dir, { serviceRoleKey });
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find service role key');
      assert.equal(results[0].pattern, 'serviceRoleKey');
      assert.ok(results[0].file);
      assert.ok(results[0].snippet);
    });

    it('detects JWT with role:service_role in payload', () => {
      const dir = makeTempDir();
      const jwt = makeJwt({ role: 'service_role', iss: 'boa' });
      writeFile(dir, 'bundle.js', `var token = "${jwt}";`);
      const results = scanBundleForSecrets(dir, {});
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find service_role JWT');
      assert.equal(results[0].pattern, 'service_role_jwt');
    });

    it('detects AWS access key pattern', () => {
      const dir = makeTempDir();
      writeFile(dir, 'config.js', 'const key = "AKIAIOSFODNN7EXAMPLE";');
      const results = scanBundleForSecrets(dir, {});
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find AWS access key');
      assert.equal(results[0].pattern, 'aws_access_key');
    });

    it('detects AWS secret key pattern', () => {
      const dir = makeTempDir();
      writeFile(dir, 'env.js', 'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"');
      const results = scanBundleForSecrets(dir, {});
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find AWS secret key');
      assert.equal(results[0].pattern, 'aws_secret_key');
    });

    it('detects RSA private key header', () => {
      const dir = makeTempDir();
      writeFile(dir, 'key.js', 'const pem = "-----BEGIN RSA PRIVATE KEY-----";');
      const results = scanBundleForSecrets(dir, {});
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find private key');
      assert.equal(results[0].pattern, 'private_key');
    });

    it('detects EC private key header', () => {
      const dir = makeTempDir();
      writeFile(dir, 'key.js', 'const pem = "-----BEGIN EC PRIVATE KEY-----";');
      const results = scanBundleForSecrets(dir, {});
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find EC private key');
    });

    it('detects OPENSSH private key header', () => {
      const dir = makeTempDir();
      writeFile(dir, 'key.js', 'const pem = "-----BEGIN OPENSSH PRIVATE KEY-----";');
      const results = scanBundleForSecrets(dir, {});
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find OPENSSH private key');
    });

    it('detects bare PRIVATE KEY header', () => {
      const dir = makeTempDir();
      writeFile(dir, 'key.js', 'const pem = "-----BEGIN PRIVATE KEY-----";');
      const results = scanBundleForSecrets(dir, {});
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find bare private key');
      assert.equal(results[0].pattern, 'private_key');
    });

    it('detects JWT_SECRET value from knownSecrets', () => {
      const dir = makeTempDir();
      const jwtSecret = 'super-secret-jwt-key-12345';
      writeFile(dir, 'app.js', `const s = "${jwtSecret}";`);
      const results = scanBundleForSecrets(dir, { JWT_SECRET: jwtSecret });
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find JWT_SECRET');
      assert.equal(results[0].pattern, 'jwt_secret');
    });

    it('detects JWT with non-standard role (admin)', () => {
      const dir = makeTempDir();
      const jwt = makeJwt({ role: 'admin', iss: 'boa' });
      writeFile(dir, 'bundle.js', `var t = "${jwt}";`);
      const results = scanBundleForSecrets(dir, {});
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to find admin role JWT');
    });
  });

  describe('negative detections', () => {
    it('allows anonKey (JWT with role:anon)', () => {
      const dir = makeTempDir();
      const anonKey = makeJwt({ role: 'anon', iss: 'boa' });
      writeFile(dir, 'app.js', `const key = "${anonKey}";`);
      const results = scanBundleForSecrets(dir, { anonKey });
      assert.deepEqual(results, [], 'expected no matches for anon key');
    });

    it('allows JWT with role:authenticated', () => {
      const dir = makeTempDir();
      const jwt = makeJwt({ role: 'authenticated', iss: 'boa' });
      writeFile(dir, 'app.js', `const t = "${jwt}";`);
      const results = scanBundleForSecrets(dir, {});
      assert.deepEqual(results, [], 'expected no matches for authenticated role JWT');
    });

    it('allows JWT with no role field', () => {
      const dir = makeTempDir();
      const jwt = makeJwt({ iss: 'boa', sub: 'user123' });
      writeFile(dir, 'app.js', `const t = "${jwt}";`);
      const results = scanBundleForSecrets(dir, {});
      assert.deepEqual(results, [], 'expected no matches for JWT without role');
    });

    it('ignores short strings that look like AWS keys (< 16 chars after AKIA)', () => {
      const dir = makeTempDir();
      writeFile(dir, 'app.js', 'const key = "AKIA123456789012345";');
      const results = scanBundleForSecrets(dir, {});
      assert.deepEqual(results, [], 'expected no matches for short AKIA string');
    });

    it('skips binary files (NUL bytes in first 8KB)', () => {
      const dir = makeTempDir();
      const binary = Buffer.alloc(8192);
      binary[100] = 0;
      binary.write('AKIAIOSFODNN7EXAMPLE', 200);
      writeFileSync(join(dir, 'image.png'), binary);
      const results = scanBundleForSecrets(dir, {});
      assert.deepEqual(results, [], 'expected binary files to be skipped');
    });
  });

  describe('multi-file and minified', () => {
    it('finds secrets across multiple JS files', () => {
      const dir = makeTempDir();
      writeFile(dir, 'a.js', 'const key = "AKIAIOSFODNN7EXAMPLE";');
      writeFile(dir, 'b.js', 'const pem = "-----BEGIN RSA PRIVATE KEY-----";');
      writeFile(dir, 'c.js', 'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"');
      const results = scanBundleForSecrets(dir, {});
      assert.equal(results.length, 3, 'expected matches from all 3 files');
      const files = results.map((r) => r.file);
      assert.ok(files.some((f) => f.includes('a.js')));
      assert.ok(files.some((f) => f.includes('b.js')));
      assert.ok(files.some((f) => f.includes('c.js')));
    });

    it('detects secrets in minified single-line files', () => {
      const dir = makeTempDir();
      const serviceRoleKey = 'my-secret-service-role-key-value';
      const minified = 'var a=1;var b=2;var c="' + serviceRoleKey + '";var d=3;';
      writeFile(dir, 'bundle.min.js', minified);
      const results = scanBundleForSecrets(dir, { serviceRoleKey });
      assert.ok(results.length > 0, 'expected scanBundleForSecrets to detect secret in minified file');
      assert.ok(results[0].file.includes('bundle.min.js'));
    });
  });
});

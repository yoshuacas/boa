import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeAmplifyHeaders, validateHeaders } from '../lib/frontend.mjs';

let tempDir;

function makeTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'boa-headers-'));
  return tempDir;
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('validateHeaders', () => {
  describe('third-party script integrity check', () => {
    it('warns about external script without integrity attribute', () => {
      const dir = makeTempDir();
      const html = '<html><head><script src="https://cdn.example.com/widget.js"></script></head><body></body></html>';
      writeFileSync(join(dir, 'index.html'), html);
      const warnings = validateHeaders(dir, {});
      assert.ok(
        warnings.some((w) => w.toLowerCase().includes('integrity')),
        'expected warning about subresource integrity'
      );
    });

    it('does not warn when script has integrity and crossorigin', () => {
      const dir = makeTempDir();
      const html = '<html><head><script src="https://cdn.example.com/widget.js" integrity="sha384-abc123" crossorigin="anonymous"></script></head><body></body></html>';
      writeFileSync(join(dir, 'index.html'), html);
      const warnings = validateHeaders(dir, {});
      const sriWarnings = warnings.filter((w) => w.toLowerCase().includes('integrity'));
      assert.equal(sriWarnings.length, 0, 'expected no SRI warning when integrity is present');
    });

    it('does not warn for inline scripts only', () => {
      const dir = makeTempDir();
      const html = '<html><head><script>console.log("hi")</script></head><body></body></html>';
      writeFileSync(join(dir, 'index.html'), html);
      const warnings = validateHeaders(dir, {});
      const sriWarnings = warnings.filter((w) => w.toLowerCase().includes('integrity'));
      assert.equal(sriWarnings.length, 0, 'expected no SRI warning for inline scripts');
    });
  });

  describe('suppressHeaderWarnings config', () => {
    it('suppresses warnings when frontend.suppressHeaderWarnings is true', () => {
      const dir = makeTempDir();
      const html = '<html><head><script src="https://cdn.example.com/widget.js"></script></head><body></body></html>';
      writeFileSync(join(dir, 'index.html'), html);
      const warnings = validateHeaders(dir, {
        frontend: { suppressHeaderWarnings: true },
      });
      assert.deepEqual(warnings, [], 'expected warnings to be suppressed');
    });
  });

  describe('validation warnings for existing headers', () => {
    it('warns when frame-ancestors is removed from CSP', () => {
      const dir = makeTempDir();
      const headersYaml = `customHeaders:
  - pattern: '/**'
    headers:
      - key: Content-Security-Policy
        value: "default-src 'self'; script-src 'self'"
`;
      writeFileSync(join(dir, 'amplify-headers.yaml'), headersYaml);
      const warnings = validateHeaders(dir, {
        checkCsp: true,
      });
      assert.ok(
        warnings.some((w) => w.toLowerCase().includes('clickjacking')),
        'expected warning about clickjacking risk when frame-ancestors is missing'
      );
    });

    it('warns when unsafe-inline is in script-src', () => {
      const dir = makeTempDir();
      const headersYaml = `customHeaders:
  - pattern: '/**'
    headers:
      - key: Content-Security-Policy
        value: "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'self'"
`;
      writeFileSync(join(dir, 'amplify-headers.yaml'), headersYaml);
      const warnings = validateHeaders(dir, {
        checkCsp: true,
      });
      assert.ok(
        warnings.some((w) => w.toLowerCase().includes('xss')),
        'expected warning about XSS risk when unsafe-inline is present'
      );
    });

    it('does not warn when only connect-src is changed', () => {
      const dir = makeTempDir();
      const headersYaml = `customHeaders:
  - pattern: '/**'
    headers:
      - key: Content-Security-Policy
        value: "default-src 'self'; connect-src 'self' https://api.example.com; frame-ancestors 'self'"
`;
      writeFileSync(join(dir, 'amplify-headers.yaml'), headersYaml);
      const warnings = validateHeaders(dir, {
        checkCsp: true,
      });
      assert.deepEqual(warnings, [], 'expected no warnings when only connect-src is modified');
    });
  });

  describe('both checks run when both files exist', () => {
    it('returns warnings from both YAML and HTML branches', () => {
      const dir = makeTempDir();
      const headersYaml = `customHeaders:
  - pattern: '/**'
    headers:
      - key: Content-Security-Policy
        value: "default-src 'self'; script-src 'self'"
`;
      writeFileSync(join(dir, 'amplify-headers.yaml'), headersYaml);
      const html = '<html><head><script src="https://cdn.example.com/widget.js"></script></head><body></body></html>';
      writeFileSync(join(dir, 'index.html'), html);
      const warnings = validateHeaders(dir, {});
      assert.ok(
        warnings.some((w) => w.toLowerCase().includes('clickjacking')),
        'expected clickjacking warning from YAML branch'
      );
      assert.ok(
        warnings.some((w) => w.toLowerCase().includes('integrity')),
        'expected SRI warning from HTML branch'
      );
    });
  });

  describe('inline and same-origin scripts do not warn', () => {
    it('does not warn for inline scripts and relative-URL scripts', () => {
      const dir = makeTempDir();
      const html = '<html><head><script>console.log("inline")</script><script src="/local.js"></script></head><body></body></html>';
      writeFileSync(join(dir, 'index.html'), html);
      const warnings = validateHeaders(dir, {});
      const sriWarnings = warnings.filter((w) => w.toLowerCase().includes('integrity'));
      assert.equal(sriWarnings.length, 0, 'expected no SRI warnings for inline/relative scripts');
    });
  });

  describe('scripts with integrity attribute do not warn', () => {
    it('does not warn when integrity attribute is present', () => {
      const dir = makeTempDir();
      const html = '<html><head><script src="https://cdn.example.com/x.js" integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC" crossorigin="anonymous"></script></head><body></body></html>';
      writeFileSync(join(dir, 'index.html'), html);
      const warnings = validateHeaders(dir, {});
      const sriWarnings = warnings.filter((w) => w.toLowerCase().includes('integrity'));
      assert.equal(sriWarnings.length, 0, 'expected no SRI warnings when integrity is present');
    });
  });

  describe('suppressHeaderWarnings suppresses both checks', () => {
    it('returns empty array when both files have violations but suppression is on', () => {
      const dir = makeTempDir();
      const headersYaml = `customHeaders:
  - pattern: '/**'
    headers:
      - key: Content-Security-Policy
        value: "default-src 'self'; script-src 'self'"
`;
      writeFileSync(join(dir, 'amplify-headers.yaml'), headersYaml);
      const html = '<html><head><script src="https://cdn.example.com/widget.js"></script></head><body></body></html>';
      writeFileSync(join(dir, 'index.html'), html);
      const warnings = validateHeaders(dir, {
        frontend: { suppressHeaderWarnings: true },
      });
      assert.deepEqual(warnings, [], 'expected empty warnings array when suppressed');
    });
  });

  describe('missing files produce no warnings', () => {
    it('returns empty array for an empty directory', () => {
      const dir = makeTempDir();
      const warnings = validateHeaders(dir, {});
      assert.deepEqual(warnings, [], 'expected no warnings for empty directory');
    });
  });
});

describe('writeAmplifyHeaders', () => {
  describe('default headers', () => {
    it('writes YAML with all 6 default security headers', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        storageUrl: 'https://bucket.s3.us-east-1.amazonaws.com',
      };
      writeAmplifyHeaders(dir, cfg);
      const content = readFileSync(join(dir, 'amplify-headers.yaml'), 'utf8');
      assert.ok(content.includes('Strict-Transport-Security'), 'expected HSTS header');
      assert.ok(content.includes('X-Content-Type-Options'), 'expected X-Content-Type-Options header');
      assert.ok(content.includes('X-Frame-Options'), 'expected X-Frame-Options header');
      assert.ok(content.includes('Referrer-Policy'), 'expected Referrer-Policy header');
      assert.ok(content.includes('Permissions-Policy'), 'expected Permissions-Policy header');
      assert.ok(content.includes('Content-Security-Policy'), 'expected CSP header');
    });

    it('includes apiUrl in CSP connect-src', () => {
      const dir = makeTempDir();
      const cfg = { apiUrl: 'https://api.example.dev' };
      writeAmplifyHeaders(dir, cfg);
      const content = readFileSync(join(dir, 'amplify-headers.yaml'), 'utf8');
      assert.ok(
        content.includes('https://api.example.dev'),
        'expected CSP connect-src to include API URL'
      );
    });

    it('includes storageUrl in CSP img-src', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        storageUrl: 'https://bucket.s3.region.amazonaws.com',
      };
      writeAmplifyHeaders(dir, cfg);
      const content = readFileSync(join(dir, 'amplify-headers.yaml'), 'utf8');
      assert.ok(
        content.includes('https://bucket.s3.region.amazonaws.com'),
        'expected CSP img-src to include storage URL'
      );
    });
  });

  describe('CSP merge from config', () => {
    it('merges custom connectSrc into CSP', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        frontend: {
          csp: { connectSrc: ['https://api.stripe.com'] },
        },
      };
      writeAmplifyHeaders(dir, cfg);
      const content = readFileSync(join(dir, 'amplify-headers.yaml'), 'utf8');
      assert.ok(
        content.includes('https://api.stripe.com'),
        'expected CSP connect-src to include custom Stripe URL'
      );
      assert.ok(
        content.includes('https://api.example.dev'),
        'expected CSP connect-src to still include API URL'
      );
    });

    it('merges custom scriptSrc with self', () => {
      const dir = makeTempDir();
      const cfg = {
        apiUrl: 'https://api.example.dev',
        frontend: {
          csp: { scriptSrc: ['https://cdn.example.com'] },
        },
      };
      writeAmplifyHeaders(dir, cfg);
      const content = readFileSync(join(dir, 'amplify-headers.yaml'), 'utf8');
      assert.ok(
        content.includes("'self'"),
        'expected CSP script-src to include self'
      );
      assert.ok(
        content.includes('https://cdn.example.com'),
        'expected CSP script-src to include custom CDN URL'
      );
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  parseAllowedOrigins, isAllowedOrigin,
} from '../templates/lambda/cors-origin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('cors-origin: explicit allowlist (sec M-9)', () => {
  it('allows an origin that appears verbatim in the list', () => {
    const list = parseAllowedOrigins('https://app.example.com');
    assert.equal(isAllowedOrigin('https://app.example.com', list), true);
  });

  it('rejects an origin not in the list', () => {
    const list = parseAllowedOrigins('https://app.example.com');
    assert.equal(isAllowedOrigin('https://evil.com', list), false);
  });

  it('rejects an empty origin', () => {
    assert.equal(isAllowedOrigin('', ['https://a.com']), false);
    assert.equal(isAllowedOrigin(undefined, ['https://a.com']), false);
  });

  it('parses a comma-delimited env string with whitespace', () => {
    const list = parseAllowedOrigins(
      'https://a.com , https://b.com,https://c.com',
    );
    assert.deepEqual(list,
      ['https://a.com', 'https://b.com', 'https://c.com']);
  });

  it('treats empty env as empty list (not [""])', () => {
    assert.deepEqual(parseAllowedOrigins(''), []);
    assert.deepEqual(parseAllowedOrigins(undefined), []);
  });
});

describe('cors-origin: localhost auto-allow (dev ergonomics)', () => {
  // When the operator has not configured an explicit allowlist, any
  // http://localhost:* or http://127.0.0.1:* origin is accepted.
  // Only reachable from the developer's own machine, so no
  // cross-user exposure — removes a friction point that used to
  // make the default-deployed Lambda unusable from `npx vite`.

  it('allows http://localhost without a port', () => {
    assert.equal(isAllowedOrigin('http://localhost', []), true);
  });

  it('allows http://localhost:<port> on any port', () => {
    for (const port of ['3000', '5173', '8080', '53811']) {
      assert.equal(
        isAllowedOrigin(`http://localhost:${port}`, []), true,
        `expected port ${port} to be allowed`,
      );
    }
  });

  it('allows http://127.0.0.1:<port>', () => {
    assert.equal(
      isAllowedOrigin('http://127.0.0.1:3000', []), true);
  });

  it('rejects https://localhost (only http is auto-allowed)', () => {
    // https on localhost is unusual and implies the dev bothered to
    // set up TLS — at that point they can add an explicit allowlist.
    assert.equal(
      isAllowedOrigin('https://localhost:3000', []), false);
  });

  it('rejects other loopback-ish addresses', () => {
    // ::1 (IPv6 loopback) — browsers don't emit this as an Origin
    // very often; keep the rule tight and reject until we see it.
    assert.equal(isAllowedOrigin('http://[::1]:3000', []), false);
    // 0.0.0.0 is not loopback.
    assert.equal(isAllowedOrigin('http://0.0.0.0:3000', []), false);
  });

  it('rejects a hostname that merely starts with "localhost"', () => {
    assert.equal(
      isAllowedOrigin('http://localhost.evil.com', []), false);
  });

  it('does NOT auto-allow localhost once an explicit list is set', () => {
    // If the operator configured a list, respect it — they chose to
    // lock down their stack.
    const list = parseAllowedOrigins('https://app.example.com');
    assert.equal(isAllowedOrigin('http://localhost:3000', list), false);
  });
});

describe('presigned-upload.mjs wires CORS through the shared helper', () => {
  const src = readFileSync(
    join(__dirname, '..', 'templates', 'lambda', 'presigned-upload.mjs'),
    'utf8',
  );

  it('imports isAllowedOrigin from cors-origin.mjs', () => {
    assert.match(src,
      /from\s+['"]\.\/cors-origin\.mjs['"]/);
    assert.match(src, /isAllowedOrigin/);
  });

  it('echoes only matching origin, not *', () => {
    assert.doesNotMatch(src,
      /Access-Control-Allow-Origin['":\s]+\*/);
  });

  it('adds Vary: Origin for correctness', () => {
    assert.match(src, /"Vary":\s*"Origin"/);
  });
});

describe('index.mjs wires CORS through the shared helper', () => {
  const src = readFileSync(
    join(__dirname, '..', 'templates', 'lambda', 'index.mjs'),
    'utf8',
  );

  it('imports isAllowedOrigin from cors-origin.mjs', () => {
    assert.match(src,
      /from\s+['"]\.\/cors-origin\.mjs['"]/);
    assert.match(src, /isAllowedOrigin/);
  });

  it('passes a predicate (not a list) to createPgrest', () => {
    // We use the function form so the localhost rule applies
    // per-request, not only to origins the operator listed.
    assert.match(src, /allowedOrigins:\s*\(origin\)\s*=>/);
  });
});

describe('backend.yaml no longer sets Allow-Origin: *', () => {
  const src = readFileSync(
    join(__dirname, '..', 'templates', 'backend.yaml'),
    'utf8',
  );

  it('has no Access-Control-Allow-Origin: * header', () => {
    assert.doesNotMatch(src, /Access-Control-Allow-Origin:\s*"'\*'"/);
  });

  it('has no AllowOrigin: * in the SAM Cors block', () => {
    assert.doesNotMatch(src, /AllowOrigin:\s*"'\*'"/);
  });

  it('declares an AllowedOrigins parameter', () => {
    assert.match(src, /AllowedOrigins:/);
    assert.match(src, /CommaDelimitedList/);
  });

  it('passes ALLOWED_ORIGINS to the ApiFunction env', () => {
    assert.match(src, /ALLOWED_ORIGINS:\s*!Join/);
  });
});

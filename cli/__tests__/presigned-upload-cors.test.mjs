import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('presigned-upload CORS allowlist (sec M-9)', () => {
  const src = readFileSync(
    join(__dirname, '..', 'templates', 'lambda', 'presigned-upload.mjs'),
    'utf8',
  );

  it('reads ALLOWED_ORIGINS env var', () => {
    assert.match(src, /process\.env\.ALLOWED_ORIGINS/);
  });

  it('emits no CORS headers when allowlist is empty', () => {
    assert.match(src, /ALLOWED_ORIGINS\.size === 0/);
  });

  it('echoes only matching origin, not *', () => {
    // The allow-origin value must come from origin, not a hardcoded *
    assert.doesNotMatch(src,
      /Access-Control-Allow-Origin['":\s]+\*/);
  });

  it('adds Vary: Origin for correctness', () => {
    assert.match(src, /"Vary":\s*"Origin"/);
  });
});

describe('index.mjs forwards ALLOWED_ORIGINS to pgrest-lambda', () => {
  const src = readFileSync(
    join(__dirname, '..', 'templates', 'lambda', 'index.mjs'),
    'utf8',
  );

  it('parses ALLOWED_ORIGINS from env', () => {
    assert.match(src, /process\.env\.ALLOWED_ORIGINS/);
  });

  it('passes allowedOrigins to createPgrest', () => {
    assert.match(src, /cors:/);
    assert.match(src, /allowedOrigins/);
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

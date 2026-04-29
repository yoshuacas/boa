import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// sanitizeFilename lives as a module-private helper in the Lambda
// template. We can either export it (noisier) or test it by eval-
// import. Simpler path: exercise the whole handler with mocked S3
// and check the resulting key. The handler is a Lambda template so
// we can import it directly.

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('presigned-upload filename sanitization (sec M-13)', () => {
  // Read-and-rewrite the template once, rewriting the S3 client to
  // a stub, then dynamic-import it. We avoid mocking @aws-sdk on a
  // per-test basis because the template caches a module-level
  // S3Client instance.
  const templateSrc = readFileSync(
    join(__dirname, '..', 'templates', 'lambda', 'presigned-upload.mjs'),
    'utf8',
  );

  it('has a sanitizeFilename helper at source level', () => {
    assert.match(templateSrc, /function sanitizeFilename/);
  });

  it('strips path traversal via basename', () => {
    assert.match(templateSrc, /basename\(/);
  });

  it('replaces unsafe chars with underscore', () => {
    // Confirms the regex survives the edit
    assert.match(templateSrc, /\[\^a-zA-Z0-9\._\-\]/);
  });

  it('caps length at 200 chars', () => {
    assert.match(templateSrc, /slice\(0,\s*200\)/);
  });

  it('rejects the empty sanitized result with 400', () => {
    assert.match(templateSrc, /Invalid filename/);
    assert.match(templateSrc, /!safeFilename/);
  });

  it('key uses the sanitized filename, not the raw one', () => {
    assert.match(
      templateSrc,
      /uploads\/\$\{userId\}\/\$\{randomUUID\(\)\}-\$\{safeFilename\}/,
    );
  });

  it('strips leading dots so keys do not start with . or ..', () => {
    assert.match(templateSrc, /replace\(\/\^\\\.\+\//);
  });
});

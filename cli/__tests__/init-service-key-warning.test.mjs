import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// Lightweight test: inspect the source of init.mjs for the warning.
// A full integration test would require stubbing AWS calls across a
// real deploy flow (done in deploy-migration.test.mjs etc). For a
// static string we only need to know the warning is in the file.

describe('boa init service role key warning (sec L-21)', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const initSrc = readFileSync(
    join(__dirname, '..', 'commands', 'init.mjs'),
    'utf8',
  );

  it('mentions the service role key by name', () => {
    assert.match(initSrc, /service role key/i);
  });

  it('tells the user not to embed it in browsers', () => {
    assert.match(initSrc, /browser|mobile/i);
    assert.match(initSrc, /[Nn]ever embed/);
  });

  it('points the user at secret storage', () => {
    assert.match(initSrc, /SSM|secrets manager/i);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '..', 'templates', 'auth', '001_better_auth_dsql.sql'),
  'utf8',
);

describe('better-auth DSQL bootstrap schema', () => {
  it('creates the private better_auth schema', () => {
    assert.ok(sql.includes('CREATE SCHEMA IF NOT EXISTS better_auth'));
  });

  it('creates required better-auth tables', () => {
    for (const table of [
      '"user"', 'session', 'account', 'verification', 'jwks',
    ]) {
      assert.ok(
        sql.includes(`CREATE TABLE IF NOT EXISTS better_auth.${table}`),
        `missing better_auth.${table}`
      );
    }
  });

  it('does not use foreign keys unsupported by DSQL', () => {
    const uncommented = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    assert.ok(
      !/\bREFERENCES\b/i.test(uncommented),
      'DSQL bootstrap schema must not contain REFERENCES constraints'
    );
  });
});

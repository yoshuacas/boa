import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// rotate-keys runs aws CLI commands for SSM; we need to intercept
// those without touching the real AWS account. Strategy: spawn the
// command in a fresh cwd with a dummy .boa/config.json and a PATH
// that points to a fake `aws` on disk.

describe('boa rotate-keys (sec H-5)', () => {
  let tmp;
  let origCwd;

  beforeEach(() => {
    origCwd = process.cwd();
    tmp = mkdtempSync(join(tmpdir(), 'boa-rotate-'));
    mkdirSync(join(tmp, '.boa'), { recursive: true });
    mkdirSync(join(tmp, 'bin'), { recursive: true });

    // Seed config
    writeFileSync(join(tmp, '.boa', 'config.json'), JSON.stringify({
      stackName: 'testproj',
      region: 'us-east-1',
      accountId: '123456789012',
      apiUrl: 'https://example.execute-api.us-east-1.amazonaws.com/prod',
      anonKey: 'old-anon',
      serviceRoleKey: 'old-service-role',
      authProvider: 'better-auth',
      dsqlEndpoint: 'example.dsql.us-east-1.on.aws',
      pgrestLambdaVersion: '0.2.0',
      bucketName: 'testproj-storage',
      deployedAt: '2026-04-01T00:00:00Z',
      extensions: [],
    }, null, 2));

    // Fake `aws` CLI: print a known secret on get-parameter, swallow put-parameter
    const fakeAws = `#!/bin/sh
case "$2" in
  put-parameter) exit 0 ;;
  get-parameter) printf "test-secret-32chars-or-longer-1234567890" ;;
esac
`;
    writeFileSync(join(tmp, 'bin', 'aws'), fakeAws, { mode: 0o755 });

    process.chdir(tmp);
    process.env.PATH = join(tmp, 'bin') + ':' + process.env.PATH;
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('rotates keys and preserves other config fields', async () => {
    const rotate = (await import(
      `../commands/rotate-keys.mjs?t=${Date.now()}`
    )).default;

    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      await rotate([]);
    } finally {
      console.log = origLog;
    }

    const updated = JSON.parse(
      readFileSync(join(tmp, '.boa', 'config.json'), 'utf8')
    );
    assert.notEqual(updated.anonKey, 'old-anon',
      'anonKey must be rewritten');
    assert.notEqual(updated.serviceRoleKey, 'old-service-role',
      'serviceRoleKey must be rewritten');
    assert.equal(updated.stackName, 'testproj',
      'unrelated fields must survive rotation');
    assert.equal(updated.bucketName, 'testproj-storage');
    assert.equal(updated.pgrestLambdaVersion, '0.2.0');
    assert.ok(updated.keysRotatedAt,
      'keysRotatedAt timestamp is recorded');

    // Decode the new key to confirm the 90-day expiry
    const payload = JSON.parse(
      Buffer.from(updated.anonKey.split('.')[1], 'base64url').toString()
    );
    const now = Math.floor(Date.now() / 1000);
    const expected = now + 90 * 24 * 3600;
    assert.ok(Math.abs(payload.exp - expected) < 60,
      `new key exp ${payload.exp} should be ~90 days out`);
  });
});

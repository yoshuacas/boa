import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmp;
let origCwd;
let origPath;
let callLog;

function setupProject(frontendConfig = {}) {
  const boaDir = join(tmp, '.boa');
  mkdirSync(boaDir, { recursive: true });
  const cfg = {
    stackName: 'test-stack',
    region: 'us-east-1',
    apiUrl: 'https://api.example.com',
    anonKey: 'anon-key-123',
    serviceRoleKey: 'srv-key-456',
    authProvider: 'better-auth',
    ...frontendConfig,
  };
  writeFileSync(join(boaDir, 'config.json'), JSON.stringify(cfg, null, 2));
  return cfg;
}

function setupFrontend(dir = 'web') {
  const webDir = join(tmp, dir);
  mkdirSync(webDir, { recursive: true });
  writeFileSync(join(webDir, 'package.json'), JSON.stringify({
    name: 'test-app',
    dependencies: { vite: '^5.0.0' },
  }));
  const distDir = join(webDir, 'dist');
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, 'index.html'), '<html></html>');
  return webDir;
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'boa-deploy-fe-'));
  origCwd = process.cwd();
  origPath = process.env.PATH;
  process.chdir(tmp);

  callLog = join(tmp, 'calls.log');
  mkdirSync(join(tmp, 'bin'), { recursive: true });

  const fakeAws = `#!/bin/sh
echo "$@" >> "${callLog}"
case "$@" in
  *create-app*)
    echo '{"app":{"appId":"app-new-001","defaultDomain":"main.app-new-001.amplifyapp.com"}}'
    ;;
  *create-branch*)
    echo '{"branch":{"branchName":"main"}}'
    ;;
  *create-deployment*)
    echo '{"jobId":"job-99","zipUploadUrl":"https://s3.example.com/upload"}'
    ;;
  *start-deployment*)
    echo '{"jobSummary":{"status":"PENDING"}}'
    ;;
  *get-job*)
    echo '{"job":{"summary":{"status":"SUCCEED","endTime":"2026-01-01T00:00:00Z"}}}'
    ;;
  *get-app*)
    echo '{"app":{"appId":"app-existing","name":"test-app"}}'
    ;;
  *delete-app*)
    echo '{"app":{"appId":"app-existing"}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`;
  writeFileSync(join(tmp, 'bin', 'aws'), fakeAws, { mode: 0o755 });

  const fakeCurl = `#!/bin/sh
echo "curl $@" >> "${callLog}"
`;
  writeFileSync(join(tmp, 'bin', 'curl'), fakeCurl, { mode: 0o755 });

  const fakeNpx = `#!/bin/sh
echo "npx $@" >> "${callLog}"
`;
  writeFileSync(join(tmp, 'bin', 'npx'), fakeNpx, { mode: 0o755 });

  const fakeZip = `#!/bin/sh
echo "zip $@" >> "${callLog}"
touch "$3"
`;
  writeFileSync(join(tmp, 'bin', 'zip'), fakeZip, { mode: 0o755 });

  process.env.PATH = join(tmp, 'bin') + ':' + process.env.PATH;
});

afterEach(() => {
  process.chdir(origCwd);
  process.env.PATH = origPath;
  rmSync(tmp, { recursive: true, force: true });
});

function readCalls() {
  try {
    return readFileSync(callLog, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function readConfig() {
  return JSON.parse(
    readFileSync(join(tmp, '.boa', 'config.json'), 'utf8')
  );
}

describe('deploy-frontend command', () => {
  it('reuses existing app when frontend.amplifyAppId is in config', async () => {
    setupProject({
      frontend: {
        amplifyAppId: 'app-existing',
        amplifyDomain: 'main.app-existing.amplifyapp.com',
      },
    });
    setupFrontend();

    const { default: deployFrontend } = await import('../commands/deploy-frontend.mjs');
    await deployFrontend(['./web']);

    const calls = readCalls();
    const createAppCalls = calls.filter((c) => c.includes('create-app'));
    assert.equal(createAppCalls.length, 0, 'should not call create-app');

    const getAppCalls = calls.filter((c) => c.includes('get-app'));
    assert.ok(getAppCalls.length > 0, 'should call get-app to verify existing app');
  });

  it('creates new app and branch when no frontend config exists', async () => {
    setupProject();
    setupFrontend();

    const { default: deployFrontend } = await import('../commands/deploy-frontend.mjs');
    await deployFrontend(['./web']);

    const calls = readCalls();
    const createAppCalls = calls.filter((c) => c.includes('create-app'));
    assert.ok(createAppCalls.length > 0, 'should call create-app');

    const createBranchCalls = calls.filter((c) => c.includes('create-branch'));
    assert.ok(createBranchCalls.length > 0, 'should call create-branch');

    const cfg = readConfig();
    assert.equal(cfg.frontend.amplifyAppId, 'app-new-001');
  });

  it('skips secret scan when --skip-secret-scan is passed', async () => {
    setupProject();
    const webDir = setupFrontend();
    writeFileSync(
      join(webDir, 'dist', 'app.js'),
      'const key = "srv-key-456";'
    );

    const { default: deployFrontend } = await import('../commands/deploy-frontend.mjs');
    await deployFrontend(['./web', '--skip-secret-scan']);

    const cfg = readConfig();
    assert.ok(cfg.frontend.amplifyAppId, 'deploy should succeed despite secret in bundle');
  });

  it('allows source maps when --allow-source-maps is passed', async () => {
    setupProject();
    const webDir = setupFrontend();
    writeFileSync(join(webDir, 'dist', 'app.js.map'), '{}');

    const { default: deployFrontend } = await import('../commands/deploy-frontend.mjs');
    await deployFrontend(['./web', '--allow-source-maps']);

    const cfg = readConfig();
    assert.ok(cfg.frontend.amplifyAppId, 'deploy should succeed with source maps');
  });
});

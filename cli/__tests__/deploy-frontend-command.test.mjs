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
    accountId: '123456789012',
    lambdaS3Key: 'lambda/abc123.zip',
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
  *sts*get-caller-identity*)
    echo '{"Account":"123456789012"}'
    ;;
  *s3api*head-bucket*)
    echo '{}'
    ;;
  *s3api*head-object*)
    exit 1
    ;;
  *s3api*create-bucket*)
    echo '{}'
    ;;
  *s3api*put-public-access-block*)
    echo '{}'
    ;;
  *s3*cp*)
    echo '{}'
    ;;
  *cloudformation*describe-stack-events*)
    echo '{"StackEvents":[]}'
    ;;
  *cloudformation*describe-stacks*query*)
    echo 'UPDATE_COMPLETE'
    ;;
  *cloudformation*describe-stacks*)
    echo '{"Stacks":[{"StackStatus":"UPDATE_COMPLETE","Outputs":[]}]}'
    ;;
  *cloudformation*update-stack*|*cloudformation*create-stack*)
    echo '{"StackId":"arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/fake"}'
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
for arg in "$@"; do
  case "$arg" in
    *.zip) touch "$arg" ;;
  esac
done
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

  it('updates backend stack when a new origin is registered', async () => {
    setupProject({ allowedOrigins: [] });
    setupFrontend();

    const { default: deployFrontend } = await import('../commands/deploy-frontend.mjs');
    await deployFrontend(['./web']);

    const calls = readCalls();
    const cfnCalls = calls.filter(
      (c) => c.includes('cloudformation') && (c.includes('update-stack') || c.includes('create-stack'))
    );
    assert.ok(cfnCalls.length > 0, 'should invoke cloudformation update-stack or create-stack');

    const paramsCalls = cfnCalls.filter((c) => c.includes('--parameters file://'));
    assert.ok(paramsCalls.length > 0, 'should pass --parameters file://');
    const paramsMatch = paramsCalls[0].match(/--parameters file:\/\/(\S+)/);
    assert.ok(paramsMatch, 'should have a parameters file path');
    const paramsContent = readFileSync(paramsMatch[1], 'utf8');
    const paramsJson = JSON.parse(paramsContent);
    const originsParam = paramsJson.find((p) => p.ParameterKey === 'AllowedOrigins');
    assert.ok(originsParam, 'should include AllowedOrigins parameter');
    assert.ok(
      originsParam.ParameterValue.includes('amplifyapp.com'),
      'AllowedOrigins should contain the Amplify domain'
    );

    const cfnIdx = calls.findIndex(
      (c) => c.includes('cloudformation') && (c.includes('update-stack') || c.includes('create-stack'))
    );
    const deployIdx = calls.findIndex((c) => c.includes('start-deployment'));
    assert.ok(cfnIdx < deployIdx, 'backend update should happen before start-deployment');
  });

  it('skips backend update when origin already registered', async () => {
    setupProject({
      frontend: {
        amplifyAppId: 'app-existing',
        amplifyDomain: 'main.app-existing.amplifyapp.com',
      },
      allowedOrigins: ['https://main.app-existing.amplifyapp.com'],
    });
    setupFrontend();

    const { default: deployFrontend } = await import('../commands/deploy-frontend.mjs');
    await deployFrontend(['./web']);

    const calls = readCalls();
    const cfnCalls = calls.filter(
      (c) => c.includes('cloudformation') && (c.includes('update-stack') || c.includes('create-stack'))
    );
    assert.equal(cfnCalls.length, 0, 'should not invoke cloudformation update-stack');
  });

  it('rolls back config and aborts deploy on backend update failure', async () => {
    setupProject({ allowedOrigins: [] });
    setupFrontend();

    const failAws = `#!/bin/sh
echo "$@" >> "${callLog}"
case "$@" in
  *create-app*)
    echo '{"app":{"appId":"app-new-001","defaultDomain":"main.app-new-001.amplifyapp.com"}}'
    ;;
  *create-branch*)
    echo '{"branch":{"branchName":"main"}}'
    ;;
  *sts*get-caller-identity*)
    echo '{"Account":"123456789012"}'
    ;;
  *s3api*head-bucket*)
    echo '{}'
    ;;
  *s3api*head-object*)
    exit 1
    ;;
  *s3api*create-bucket*|*s3api*put-public-access-block*)
    echo '{}'
    ;;
  *s3*cp*)
    echo '{}'
    ;;
  *cloudformation*describe-stacks*query*)
    echo 'UPDATE_COMPLETE'
    ;;
  *cloudformation*describe-stacks*)
    echo '{"Stacks":[{"StackStatus":"UPDATE_COMPLETE","Outputs":[]}]}'
    ;;
  *cloudformation*update-stack*|*cloudformation*create-stack*)
    echo "ValidationError: Simulated failure" >&2
    exit 1
    ;;
  *)
    echo '{}'
    ;;
esac
`;
    writeFileSync(join(tmp, 'bin', 'aws'), failAws, { mode: 0o755 });

    const { default: deployFrontend } = await import('../commands/deploy-frontend.mjs');
    let exitCode = 0;
    try {
      await deployFrontend(['./web']);
    } catch {
      exitCode = 1;
    }
    assert.equal(exitCode, 1, 'should exit non-zero');

    const calls = readCalls();
    const deployCalls = calls.filter((c) => c.includes('start-deployment'));
    assert.equal(deployCalls.length, 0, 'start-deployment should never be called');

    const cfg = readConfig();
    const origins = cfg.allowedOrigins || [];
    assert.equal(
      origins.filter((o) => o.includes('amplifyapp.com')).length,
      0,
      'config should be rolled back — no Amplify origin in allowedOrigins'
    );
  });
});

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'boa.mjs');

function run(args, opts = {}) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], opts, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('boa deploy migration warning', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-deploy-mig-'));
    return tmpDir;
  }

  function writeConfig(dir, config) {
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify(config)
    );
  }

  it('API Gateway URL and no extensions shows migration warning', async () => {
    const dir = makeTmpDir();
    writeConfig(dir, {
      stackName: 'test-stack',
      region: 'us-east-1',
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
      extensions: [],
    });

    // deploy will fail (no SAM), but the warning prints before that
    const { stdout } = await run(['deploy'], { cwd: dir });
    assert.ok(
      stdout.includes('Lambda Function URLs by default'),
      `stdout should contain migration warning, got: ${stdout}`
    );
    assert.ok(
      stdout.includes('Your API URL will change'),
      `stdout should contain URL change notice, got: ${stdout}`
    );
  });

  it('API Gateway URL with api-gateway extension shows no warning', async () => {
    const dir = makeTmpDir();
    writeConfig(dir, {
      stackName: 'test-stack',
      region: 'us-east-1',
      apiUrl: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
      extensions: ['api-gateway'],
    });

    const { stdout } = await run(['deploy'], { cwd: dir });
    assert.ok(
      !stdout.includes('Lambda Function URLs by default'),
      `stdout should NOT contain migration warning, got: ${stdout}`
    );
  });

  it('Function URL shows no warning', async () => {
    const dir = makeTmpDir();
    writeConfig(dir, {
      stackName: 'test-stack',
      region: 'us-east-1',
      apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
      extensions: [],
    });

    const { stdout } = await run(['deploy'], { cwd: dir });
    assert.ok(
      !stdout.includes('Lambda Function URLs by default'),
      `stdout should NOT contain migration warning, got: ${stdout}`
    );
  });
});

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

describe('boa extensions', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-extensions-'));
    return tmpDir;
  }

  it('no config: stdout contains "Available extensions:" and exit code is 0', async () => {
    const dir = makeTmpDir();
    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('Available extensions:'),
      `stdout should contain "Available extensions:", got: ${stdout}`
    );
  });

  it('no config: stdout contains alb in available extensions', async () => {
    const dir = makeTmpDir();
    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('alb'),
      `stdout should contain "alb", got: ${stdout}`
    );
  });

  it('no config: stdout contains api-gateway with deprecated marker', async () => {
    const dir = makeTmpDir();
    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('api-gateway'),
      `stdout should contain "api-gateway", got: ${stdout}`
    );
    assert.ok(
      stdout.includes('deprecated'),
      `stdout should contain "deprecated" marker for api-gateway, got: ${stdout}`
    );
  });

  it('no config: stdout does NOT contain "Enabled:" line', async () => {
    const dir = makeTmpDir();
    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      !stdout.includes('Enabled:'),
      `stdout should NOT contain "Enabled:" when no config exists, got: ${stdout}`
    );
  });

  it('empty extensions: stdout contains "Enabled: (none)"', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: [],
      })
    );

    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('Enabled: (none)'),
      `stdout should contain "Enabled: (none)", got: ${stdout}`
    );
  });

  it('alb enabled: stdout contains [enabled] marker', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: ['alb'],
      })
    );

    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('[enabled]'),
      `stdout should contain "[enabled]" marker, got: ${stdout}`
    );
  });

  it('test_extensions_list_api_gateway_deprecated_same_line', async () => {
    const dir = makeTmpDir();
    const { stdout } = await run(['extensions'], { cwd: dir });
    const lines = stdout.split('\n');
    const apiGatewayLine = lines.find(
      l => l.includes('api-gateway')
    );
    assert.ok(
      apiGatewayLine,
      `should have a line containing "api-gateway", got: ${stdout}`
    );
    assert.ok(
      apiGatewayLine.includes('deprecated'),
      `the api-gateway line should also contain "deprecated", got: ${apiGatewayLine}`
    );
  });

  it('alb enabled: stdout contains "Enabled: alb"', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: ['alb'],
      })
    );

    const { code, stdout } = await run(['extensions'], { cwd: dir });
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes('Enabled: alb'),
      `stdout should contain "Enabled: alb", got: ${stdout}`
    );
  });
});

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

describe('boa remove', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-remove-'));
    return tmpDir;
  }

  it('no arguments: stderr contains usage and exit code is 1', async () => {
    const { code, stderr } = await run(['remove']);
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes('Usage: boa remove <name>'),
      `stderr should contain usage message, got: ${stderr}`
    );
  });

  it('no config: stderr contains config not found error', async () => {
    const dir = makeTmpDir();
    const { code, stderr } = await run(
      ['remove', 'api-gateway'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes('Error: .boa/config.json not found'),
      `stderr should contain config not found error, got: ${stderr}`
    );
  });

  it('empty extensions: stderr contains not enabled error', async () => {
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

    const { code, stderr } = await run(
      ['remove', 'api-gateway'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes(
        "Error: Extension 'api-gateway' is not enabled"
      ),
      `stderr should contain not enabled error, got: ${stderr}`
    );
  });

  it('no extensions field: stderr contains not enabled error', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
      })
    );

    const { code, stderr } = await run(
      ['remove', 'api-gateway'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes(
        "Error: Extension 'api-gateway' is not enabled"
      ),
      `stderr should contain not enabled error, got: ${stderr}`
    );
  });
});

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

describe('boa extend', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-extend-'));
    return tmpDir;
  }

  it('no arguments: stderr contains usage and exit code is 1', async () => {
    const { code, stderr } = await run(['extend']);
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes('Usage: boa extend <name>'),
      `stderr should contain usage message, got: ${stderr}`
    );
  });

  it('no arguments: stderr contains hint to list extensions', async () => {
    const { stderr } = await run(['extend']);
    assert.ok(
      stderr.includes(
        "Run 'boa extensions' to see available extensions."
      ),
      `stderr should contain extensions hint, got: ${stderr}`
    );
  });

  it('no config: stderr contains config not found error', async () => {
    const dir = makeTmpDir();
    const { code, stderr } = await run(
      ['extend', 'api-gateway'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes('Error: .boa/config.json not found'),
      `stderr should contain config not found error, got: ${stderr}`
    );
  });

  it('unknown extension: stderr contains unknown extension error', async () => {
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
      ['extend', 'unknown-ext'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes("Error: Unknown extension 'unknown-ext'"),
      `stderr should contain unknown extension error, got: ${stderr}`
    );
  });

  it('already enabled: stderr contains already enabled error', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: ['api-gateway'],
      })
    );

    const { code, stderr } = await run(
      ['extend', 'api-gateway'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes(
        "Error: Extension 'api-gateway' is already enabled"
      ),
      `stderr should contain already enabled error, got: ${stderr}`
    );
  });
});

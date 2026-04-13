import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { read, write, requireConfig } from '../lib/config.mjs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('config', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-config-test-'));
    return tmpDir;
  }

  it('read() returns null when no config exists', () => {
    const dir = makeTmpDir();
    const result = read(dir);
    assert.equal(result, null);
  });

  it('read() returns parsed JSON for valid config', () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    const config = { stackName: 'test', region: 'us-east-1' };
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify(config)
    );
    const result = read(dir);
    assert.deepEqual(result, config);
  });

  it('write() creates .boa/ directory and config.json', () => {
    const dir = makeTmpDir();
    const config = { stackName: 'my-app', region: 'us-east-1' };
    write(config, dir);
    const content = readFileSync(
      join(dir, '.boa', 'config.json'),
      'utf8'
    );
    assert.deepEqual(JSON.parse(content), config);
  });

  it('round-trip: write then read returns same config', () => {
    const dir = makeTmpDir();
    const config = {
      stackName: 'my-app',
      region: 'us-east-1',
      accountId: '123456789012',
    };
    write(config, dir);
    const result = read(dir);
    assert.deepEqual(result, config);
  });

  it('write() output ends with a newline', () => {
    const dir = makeTmpDir();
    write({ stackName: 'test' }, dir);
    const raw = readFileSync(
      join(dir, '.boa', 'config.json'),
      'utf8'
    );
    assert.ok(raw.endsWith('\n'), 'file should end with newline');
  });

  it('write() output is pretty-printed with 2-space indent', () => {
    const dir = makeTmpDir();
    const config = { stackName: 'test', region: 'us-east-1' };
    write(config, dir);
    const raw = readFileSync(
      join(dir, '.boa', 'config.json'),
      'utf8'
    );
    const expected = JSON.stringify(config, null, 2) + '\n';
    assert.equal(raw, expected);
  });

  it('requireConfig() exits 1 when no config exists', async () => {
    const dir = makeTmpDir();
    // Run requireConfig in a subprocess to capture process.exit
    const script = join(__dirname, '..', 'lib', 'config.mjs');
    const code = `
      import { requireConfig } from '${script}';
      requireConfig('${dir}');
    `;
    const { code: exitCode } = await new Promise((resolve) => {
      execFile(
        'node',
        ['--input-type=module', '-e', code],
        (error) => {
          resolve({ code: error ? error.code : 0 });
        }
      );
    });
    assert.equal(exitCode, 1, 'should exit with code 1');
  });

  it('requireConfig() prints missing config error to stderr', async () => {
    const dir = makeTmpDir();
    const script = join(__dirname, '..', 'lib', 'config.mjs');
    const code = `
      import { requireConfig } from '${script}';
      requireConfig('${dir}');
    `;
    const { stderr } = await new Promise((resolve) => {
      execFile(
        'node',
        ['--input-type=module', '-e', code],
        (error, stdout, stderr) => {
          resolve({ stderr });
        }
      );
    });
    assert.ok(
      stderr.includes(
        "Error: .boa/config.json not found. Run 'boa init' first."
      ),
      `stderr should contain config-not-found message, got: ${stderr}`
    );
  });
});

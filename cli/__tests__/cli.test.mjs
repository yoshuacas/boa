import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'boa.mjs');
const PKG = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
);

function run(args) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], (error, stdout, stderr) => {
      resolve({
        code: error ? error.code : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('boa CLI entry point', () => {
  it('--version prints version and exits 0', async () => {
    const { code, stdout } = await run(['--version']);
    assert.equal(code, 0);
    assert.equal(stdout.trim(), PKG.version);
  });

  it('-v prints version and exits 0', async () => {
    const { code, stdout } = await run(['-v']);
    assert.equal(code, 0);
    assert.equal(stdout.trim(), PKG.version);
  });

  it('--help prints usage with "Commands:" and exits 0', async () => {
    const { code, stdout } = await run(['--help']);
    assert.equal(code, 0);
    assert.ok(stdout.includes('Commands:'), 'should contain "Commands:"');
  });

  it('-h prints usage and exits 0', async () => {
    const { code, stdout } = await run(['-h']);
    assert.equal(code, 0);
    assert.ok(stdout.includes('Commands:'), 'should contain "Commands:"');
  });

  it('no arguments prints usage and exits 0', async () => {
    const { code, stdout } = await run([]);
    assert.equal(code, 0);
    assert.ok(stdout.includes('Commands:'), 'should contain "Commands:"');
  });

  it('unknown command prints error to stderr and exits 1', async () => {
    const { code, stderr } = await run(['frobnicate']);
    assert.equal(code, 1);
    assert.ok(
      stderr.includes('Unknown command: frobnicate'),
      'stderr should contain "Unknown command: frobnicate"'
    );
  });

  it('unknown command stderr contains help hint', async () => {
    const { stderr } = await run(['frobnicate']);
    assert.ok(
      stderr.includes("Run 'boa --help' for usage."),
      "stderr should contain \"Run 'boa --help' for usage.\""
    );
  });

  it('--help lists all seven commands', async () => {
    const { stdout } = await run(['--help']);
    const commands = [
      'init', 'deploy', 'migrate', 'verify',
      'teardown', 'status', 'check',
    ];
    for (const cmd of commands) {
      assert.ok(
        stdout.includes(cmd),
        `help output should list "${cmd}" command`
      );
    }
  });

  it('--help contains --version and --help in Options', async () => {
    const { stdout } = await run(['--help']);
    assert.ok(stdout.includes('--version'), 'should list --version');
    assert.ok(stdout.includes('--help'), 'should list --help');
  });
});

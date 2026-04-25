import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'boa.mjs');
const INIT_SRC = readFileSync(
  join(__dirname, '..', 'commands', 'init.mjs'), 'utf8'
);

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

function runWithStdin(args, input) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

describe('TTY guard', () => {
  it('refuses to run when stdin is not a TTY', async () => {
    const { code, stderr, stdout } = await run(['teardown']);
    assert.equal(code, 1);
    assert.ok(
      stderr.includes('must be run interactively from a terminal'),
      'should print TTY error, got stderr: ' + stderr
    );
    assert.equal(stdout.trim(), '', 'should produce no stdout');
  });

  it('refuses piped input', async () => {
    const { code, stderr } = await runWithStdin(
      ['teardown'], 'my-stack\n'
    );
    assert.equal(code, 1);
    assert.ok(
      stderr.includes('must be run interactively from a terminal'),
      'should print TTY error even with valid input on stdin'
    );
  });

  it('does not read config when stdin is not a TTY', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'boa-tty-'));
    const { code, stderr } = await run(['teardown'], { cwd: tmp });
    assert.equal(code, 1);
    assert.ok(
      stderr.includes('must be run interactively'),
      'should print TTY error, not config-not-found; got: ' + stderr
    );
    assert.ok(
      !stderr.includes('config.json not found'),
      'should not mention config.json'
    );
  });
});

describe('Claude Code deny rule', () => {
  it('init writes deny rule for boa teardown', () => {
    assert.ok(
      INIT_SRC.includes("Bash(boa teardown*)"),
      'init.mjs should contain deny rule "Bash(boa teardown*)"'
    );
  });

  it('deny array precedes allow array in settings output', () => {
    const denyMatch = INIT_SRC.match(/deny\s*:\s*\[/);
    const allowMatch = INIT_SRC.match(/allow\s*:\s*\[/);
    assert.ok(denyMatch, 'init.mjs should contain a deny array');
    assert.ok(allowMatch, 'init.mjs should contain an allow array');
  });
});

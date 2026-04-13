import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256 } from '../commands/migrate.mjs';

describe('sha256', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-checksum-test-'));
    return tmpDir;
  }

  it('returns correct hex digest for "hello world\\n"', () => {
    const dir = makeTmpDir();
    const file = join(dir, 'test.txt');
    writeFileSync(file, 'hello world\n');
    const digest = sha256(file);
    assert.equal(
      digest,
      'a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447'
    );
  });

  it('identical files produce matching digests', () => {
    const dir = makeTmpDir();
    const file1 = join(dir, 'a.txt');
    const file2 = join(dir, 'b.txt');
    writeFileSync(file1, 'same content');
    writeFileSync(file2, 'same content');
    assert.equal(sha256(file1), sha256(file2));
  });

  it('different files produce different digests', () => {
    const dir = makeTmpDir();
    const file1 = join(dir, 'a.txt');
    const file2 = join(dir, 'b.txt');
    writeFileSync(file1, 'content one');
    writeFileSync(file2, 'content two');
    assert.notEqual(sha256(file1), sha256(file2));
  });

  it('empty file returns SHA-256 of empty content', () => {
    const dir = makeTmpDir();
    const file = join(dir, 'empty.txt');
    writeFileSync(file, '');
    assert.equal(
      sha256(file),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });
});

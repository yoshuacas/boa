import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  existsSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldFunctions } from '../commands/init.mjs';

describe('init scaffolds functions', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('creates functions/hello/index.mjs with handler returning 200 and body', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-init-fn-'));

    await scaffoldFunctions(tmpDir);

    const indexPath = join(tmpDir, 'functions', 'hello', 'index.mjs');
    assert.ok(existsSync(indexPath), 'functions/hello/index.mjs should exist');

    const content = readFileSync(indexPath, 'utf8');
    assert.ok(
      content.includes('export default'),
      'should have a default export'
    );
    assert.ok(
      content.includes('200'),
      'handler should return status 200'
    );
    assert.ok(
      content.includes('message') || content.includes('Hello'),
      'body should contain a message'
    );
    assert.ok(
      content.includes('userId') || content.includes('ctx.userId'),
      'body should reference userId'
    );
    assert.ok(
      content.includes('role') || content.includes('ctx.role'),
      'body should reference role'
    );
  });

  it('creates functions/hello/boa.json with visibility public', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-init-fn-'));

    await scaffoldFunctions(tmpDir);

    const boaJsonPath = join(tmpDir, 'functions', 'hello', 'boa.json');
    assert.ok(existsSync(boaJsonPath), 'functions/hello/boa.json should exist');

    const config = JSON.parse(readFileSync(boaJsonPath, 'utf8'));
    assert.equal(config.visibility, 'public');
  });

  it('does not overwrite existing functions/', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-init-fn-'));
    mkdirSync(join(tmpDir, 'functions', 'hello'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'functions', 'hello', 'index.mjs'),
      'export default async function handler() { return { status: 200, body: { custom: true } }; }'
    );

    await scaffoldFunctions(tmpDir);

    const content = readFileSync(
      join(tmpDir, 'functions', 'hello', 'index.mjs'),
      'utf8'
    );
    assert.ok(
      content.includes('custom: true'),
      'existing function should not be overwritten'
    );
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runTasks } from '../lib/ui.mjs';

// These tests run in Node's test runner where stdout is not a TTY,
// so runTasks falls back to runPlain. The assertions are on side
// effects and control flow, not on the TTY renderer — we don't want
// to couple to listr2 internals.

describe('runTasks in plain mode', () => {
  it('runs tasks sequentially by default', async () => {
    const seen = [];
    await runTasks([
      { title: 'A', run: () => { seen.push('A'); } },
      { title: 'B', run: () => { seen.push('B'); } },
      { title: 'C', run: () => { seen.push('C'); } },
    ]);
    assert.deepEqual(seen, ['A', 'B', 'C']);
  });

  it('expands nested subtasks returned from run()', async () => {
    const seen = [];
    await runTasks([
      {
        title: 'parent',
        run: () => [
          { title: 'child 1', run: () => { seen.push('c1'); } },
          { title: 'child 2', run: () => { seen.push('c2'); } },
        ],
      },
    ]);
    assert.deepEqual(seen, ['c1', 'c2']);
  });

  it('honors static skip reason', async () => {
    let ran = false;
    await runTasks([
      { title: 'skipped', skip: 'not needed', run: () => { ran = true; } },
    ]);
    assert.equal(ran, false);
  });

  it('honors dynamic skip function', async () => {
    let ran = false;
    await runTasks([
      { title: 'skipped', skip: () => 'dynamic reason', run: () => { ran = true; } },
    ]);
    assert.equal(ran, false);
  });

  it('runs the task when skip returns false', async () => {
    let ran = false;
    await runTasks([
      { title: 'run me', skip: () => false, run: () => { ran = true; } },
    ]);
    assert.equal(ran, true);
  });

  it('propagates errors when exitOnError=true (default)', async () => {
    await assert.rejects(
      () => runTasks([
        { title: 'boom', run: () => { throw new Error('nope'); } },
      ]),
      /nope/,
    );
  });

  it('continues past failures when exitOnError=false', async () => {
    const seen = [];
    await runTasks([
      { title: 'boom', run: () => { throw new Error('nope'); } },
      { title: 'after', run: () => { seen.push('after'); } },
    ], { exitOnError: false });
    assert.deepEqual(seen, ['after']);
  });

  it('passes an update() helper that accepts a progress message', async () => {
    let updateCalls = 0;
    await runTasks([
      {
        title: 'with updates',
        run: (_ctx, t) => {
          t.update('working on it');
          t.update('more progress');
          updateCalls = 2;
        },
      },
    ]);
    assert.equal(updateCalls, 2);
  });
});

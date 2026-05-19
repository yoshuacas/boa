import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { listFunctions } from '../commands/functions.mjs';

describe('functions CLI list subcommand', () => {
  it('shows deployed function as deployed and local-only function as local only', async () => {
    const deployedRegistry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const localDescriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
      { name: 'new-func', visibility: 'public', timeout: 30, memory: 256 },
    ];

    let output = '';
    const mockPrint = (text) => { output += text + '\n'; };

    const result = await listFunctions({
      deployedRegistry,
      localDescriptors,
      print: mockPrint,
    });

    assert.ok(output.includes('hello'), 'output should list hello');
    assert.ok(
      output.includes('deployed'),
      'hello should show as deployed'
    );
    assert.ok(output.includes('new-func'), 'output should list new-func');
    assert.ok(
      output.includes('local only'),
      'new-func should show as local only'
    );
  });

  it('exits 0 when local and deployed registries match', async () => {
    const deployedRegistry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const localDescriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
    ];

    const result = await listFunctions({
      deployedRegistry,
      localDescriptors,
      print: () => {},
    });

    assert.equal(result.exitCode, 0);
  });

  it('exits non-zero with deploy hint when local diverges from deployed', async () => {
    const deployedRegistry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const localDescriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
      { name: 'new-func', visibility: 'public', timeout: 30, memory: 256 },
    ];

    let output = '';
    const mockPrint = (text) => { output += text + '\n'; };

    const result = await listFunctions({
      deployedRegistry,
      localDescriptors,
      print: mockPrint,
    });

    assert.ok(result.exitCode !== 0, 'exit code should be non-zero');
    assert.ok(
      output.includes("Run 'boa deploy' to sync local changes."),
      `output should include deploy hint, got: ${output}`
    );
  });
});

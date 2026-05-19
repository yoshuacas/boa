import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { verifyFunctions } from '../commands/verify.mjs';

describe('verify functions checks', () => {
  it('passes when local matches deployed registry', async () => {
    const localDescriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
    ];
    const deployedRegistry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const result = await verifyFunctions({
      localDescriptors,
      deployedRegistry,
      ssmGetParameter: async () => ({}),
      probeRoute: async () => ({ status: 200 }),
    });

    assert.ok(result.passed, 'should pass when registries match');
    assert.equal(result.issues.length, 0);
  });

  it('reports drift when local function not deployed', async () => {
    const localDescriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
      { name: 'new-func', visibility: 'public', timeout: 30, memory: 256 },
    ];
    const deployedRegistry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const result = await verifyFunctions({
      localDescriptors,
      deployedRegistry,
      ssmGetParameter: async () => ({}),
      probeRoute: async () => ({ status: 200 }),
    });

    assert.ok(!result.passed, 'should fail with drift');
    assert.ok(
      result.issues.some((i) => i.includes('new-func') && i.includes('not deployed')),
      `should report new-func not deployed, got: ${result.issues.join('; ')}`
    );
  });

  it('reports drift when deployed function missing locally', async () => {
    const localDescriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
    ];
    const deployedRegistry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
      'old-func': { visibility: 'public', timeout: 30, memory: 256 },
    };

    const result = await verifyFunctions({
      localDescriptors,
      deployedRegistry,
      ssmGetParameter: async () => ({}),
      probeRoute: async () => ({ status: 200 }),
    });

    assert.ok(!result.passed, 'should fail with drift');
    assert.ok(
      result.issues.some((i) => i.includes('old-func') && i.includes('missing locally')),
      `should report old-func missing locally, got: ${result.issues.join('; ')}`
    );
  });

  it('passes secret check when SSM parameter exists', async () => {
    const localDescriptors = [
      { name: 'webhook', visibility: 'public', timeout: 30, memory: 256, secrets: ['STRIPE_KEY'] },
    ];
    const deployedRegistry = {
      webhook: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const result = await verifyFunctions({
      localDescriptors,
      deployedRegistry,
      stackName: 'my-stack',
      ssmGetParameter: async (name) => ({ Parameter: { Value: 'sk_live_...' } }),
      probeRoute: async () => ({ status: 200 }),
    });

    const secretIssues = result.issues.filter((i) => i.includes('STRIPE_KEY'));
    assert.equal(secretIssues.length, 0, 'should not report secret issues when SSM exists');
  });

  it('reports missing secret with path and remediation hint', async () => {
    const localDescriptors = [
      { name: 'webhook', visibility: 'public', timeout: 30, memory: 256, secrets: ['STRIPE_KEY'] },
    ];
    const deployedRegistry = {
      webhook: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const result = await verifyFunctions({
      localDescriptors,
      deployedRegistry,
      stackName: 'my-stack',
      ssmGetParameter: async () => { throw new Error('ParameterNotFound'); },
      probeRoute: async () => ({ status: 200 }),
    });

    assert.ok(!result.passed);
    assert.ok(
      result.issues.some((i) =>
        i.includes('/my-stack/functions/webhook/STRIPE_KEY')
      ),
      `should include SSM path, got: ${result.issues.join('; ')}`
    );
    assert.ok(
      result.issues.some((i) =>
        i.includes('put-parameter') || i.includes('aws ssm')
      ),
      `should include remediation hint, got: ${result.issues.join('; ')}`
    );
  });

  it('passes route reachability when response is 200 or 401', async () => {
    const localDescriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
    ];
    const deployedRegistry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const result = await verifyFunctions({
      localDescriptors,
      deployedRegistry,
      ssmGetParameter: async () => ({}),
      probeRoute: async () => ({ status: 401 }),
    });

    const routeIssues = result.issues.filter((i) => i.includes('unreachable'));
    assert.equal(routeIssues.length, 0, 'should not report unreachable for 401');
  });

  it('reports unreachable when response is 500 or timeout', async () => {
    const localDescriptors = [
      { name: 'hello', visibility: 'public', timeout: 30, memory: 256 },
    ];
    const deployedRegistry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const result = await verifyFunctions({
      localDescriptors,
      deployedRegistry,
      ssmGetParameter: async () => ({}),
      probeRoute: async () => ({ status: 500 }),
    });

    assert.ok(!result.passed);
    assert.ok(
      result.issues.some((i) => i.includes('hello') && i.includes('unreachable')),
      `should report unreachable function, got: ${result.issues.join('; ')}`
    );
  });
});

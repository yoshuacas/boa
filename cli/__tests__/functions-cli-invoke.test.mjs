import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { invokeFn, parseArgs } from '../commands/functions.mjs';

describe('functions CLI invoke subcommand', () => {
  const deployedRegistry = {
    hello: { visibility: 'public', timeout: 30, memory: 256 },
    cleanup: { visibility: 'private', timeout: 10, memory: 128 },
  };

  it('invokes Lambda with anon credentials by default', async () => {
    const invokeCalls = [];
    const mockLambdaInvoke = async (params) => {
      invokeCalls.push(params);
      return { Payload: JSON.stringify({ statusCode: 200, body: '{"ok":true}' }) };
    };

    await invokeFn('hello', {
      deployedRegistry,
      lambdaInvoke: mockLambdaInvoke,
      anonKey: 'anon-key-value',
      serviceRoleKey: 'service-role-key-value',
    });

    assert.equal(invokeCalls.length, 1);
    const payload = JSON.parse(invokeCalls[0].Payload);
    assert.ok(
      payload.headers?.apikey === 'anon-key-value'
        || invokeCalls[0].Payload.includes('anon-key-value'),
      'should invoke with anon credentials by default'
    );
  });

  it('--service flag invokes with service role key', async () => {
    const invokeCalls = [];
    const mockLambdaInvoke = async (params) => {
      invokeCalls.push(params);
      return { Payload: JSON.stringify({ statusCode: 200, body: '{"ok":true}' }) };
    };

    await invokeFn('hello', {
      deployedRegistry,
      lambdaInvoke: mockLambdaInvoke,
      anonKey: 'anon-key-value',
      serviceRoleKey: 'service-role-key-value',
      service: true,
    });

    assert.equal(invokeCalls.length, 1);
    const payload = JSON.parse(invokeCalls[0].Payload);
    assert.ok(
      payload.headers?.apikey === 'service-role-key-value'
        || invokeCalls[0].Payload.includes('service-role-key-value'),
      'should invoke with service role key'
    );
  });

  it('--data parses JSON and includes in invoke payload', async () => {
    const invokeCalls = [];
    const mockLambdaInvoke = async (params) => {
      invokeCalls.push(params);
      return { Payload: JSON.stringify({ statusCode: 200, body: '{}' }) };
    };

    await invokeFn('hello', {
      deployedRegistry,
      lambdaInvoke: mockLambdaInvoke,
      anonKey: 'anon-key-value',
      serviceRoleKey: 'service-role-key-value',
      data: '{"id": 1}',
    });

    assert.equal(invokeCalls.length, 1);
    const payload = JSON.parse(invokeCalls[0].Payload);
    assert.ok(
      payload.body?.id === 1
        || payload.payload?.id === 1
        || invokeCalls[0].Payload.includes('"id"'),
      'parsed JSON should be in the payload'
    );
  });

  it('--data with invalid JSON exits with parse error', async () => {
    let errorOutput = '';
    const mockExit = (msg) => { errorOutput = msg; };

    await assert.rejects(
      () => invokeFn('hello', {
        deployedRegistry,
        lambdaInvoke: async () => ({}),
        anonKey: 'anon-key-value',
        serviceRoleKey: 'service-role-key-value',
        data: 'invalid json{',
        onError: mockExit,
      }),
      (err) => {
        assert.ok(
          err.message.includes('Invalid JSON in --data')
            || err.message.includes('Unexpected token'),
          `Expected JSON parse error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('unknown function name exits with available functions list', async () => {
    await assert.rejects(
      () => invokeFn('nonexistent', {
        deployedRegistry,
        lambdaInvoke: async () => ({}),
        anonKey: 'anon-key-value',
        serviceRoleKey: 'service-role-key-value',
      }),
      (err) => {
        assert.ok(
          err.message.includes("Unknown function 'nonexistent'"),
          `Expected unknown function error, got: ${err.message}`
        );
        assert.ok(
          err.message.includes('hello'),
          `Expected available functions list, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('--service on a private function sends direct-invoke shape with _boaInternal', async () => {
    const invokeCalls = [];
    const mockLambdaInvoke = async (params) => {
      invokeCalls.push(params);
      return { Payload: JSON.stringify({ statusCode: 200, body: '{"ok":true}' }) };
    };

    await invokeFn('cleanup', {
      deployedRegistry,
      lambdaInvoke: mockLambdaInvoke,
      anonKey: 'anon-key-value',
      serviceRoleKey: 'service-role-key-value',
      service: true,
      functionName: 'test-stack-functions',
    });

    assert.equal(invokeCalls.length, 1);
    const payload = JSON.parse(invokeCalls[0].Payload);
    assert.deepEqual(payload._boaInternal, { name: 'cleanup' });
    assert.equal(payload.headers.apikey, 'service-role-key-value');
  });
});

describe('functions CLI logs command', () => {
  it('logsFn shell-escapes the function name in filter-pattern', async () => {
    const { logsFn } = await import('../commands/functions.mjs');
    const commands = [];

    await logsFn('hello-world', {
      stackName: 'my-stack',
      region: 'us-east-1',
      _exec: (cmd) => { commands.push(cmd); return ''; },
    });

    assert.equal(commands.length, 1);
    const cmd = commands[0];
    assert.ok(
      cmd.includes("'hello-world'") || cmd.includes("'\\''"),
      `function name should be shell-escaped in command: ${cmd}`
    );
  });
});

describe('functions CLI parseArgs', () => {
  it('boolean flag --service does not consume next positional', () => {
    const result = parseArgs(['--service', 'hello']);
    assert.equal(result.flags.service, true);
    assert.deepEqual(result.positional, ['hello']);
  });

  it('unknown flag without value does not consume next positional', () => {
    const result = parseArgs(['--verbose', 'hello']);
    assert.equal(result.flags.verbose, true);
    assert.deepEqual(result.positional, ['hello']);
  });
});

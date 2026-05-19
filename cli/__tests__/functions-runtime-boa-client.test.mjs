import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoaClient } from '../lib/functions/runtime/boa-client.mjs';

describe('functions runtime boa-client', () => {
  const callerJwt = 'eyJhbGciOiJIUzI1NiJ9.caller-token';
  const apiUrl = 'https://abc123.execute-api.us-east-1.amazonaws.com/prod';

  it('functions.invoke forwards caller JWT and sets _boaInternal', async () => {
    const invokeCalls = [];
    const mockLambdaInvoke = async (params) => {
      invokeCalls.push(params);
      return { Payload: JSON.stringify({ statusCode: 200, body: '{}' }) };
    };

    const client = buildBoaClient(callerJwt, 'authenticated', {
      apiUrl,
      lambdaInvoke: mockLambdaInvoke,
    });

    const payload = { id: 1, action: 'process' };
    await client.functions.invoke('other', payload);

    assert.equal(invokeCalls.length, 1);
    const invokePayload = JSON.parse(invokeCalls[0].Payload);
    assert.equal(invokePayload._boaInternal.name, 'other');
    assert.ok(invokePayload._boaInternal);
    assert.ok(
      invokeCalls[0].Payload.includes(callerJwt)
        || invokePayload.headers?.authorization?.includes(callerJwt),
      'caller JWT should be forwarded'
    );
  });

  it('asService().functions.invoke uses service-role token instead of caller JWT', async () => {
    const invokeCalls = [];
    const mockLambdaInvoke = async (params) => {
      invokeCalls.push(params);
      return { Payload: JSON.stringify({ statusCode: 200, body: '{}' }) };
    };

    const client = buildBoaClient(callerJwt, 'authenticated', {
      apiUrl,
      lambdaInvoke: mockLambdaInvoke,
      serviceRoleKey: 'service-role-key-value',
    });

    const elevated = client.asService();
    await elevated.functions.invoke('other', { cleanup: true });

    assert.equal(invokeCalls.length, 1);
    const invokePayload = JSON.parse(invokeCalls[0].Payload);
    assert.ok(!invokeCalls[0].Payload.includes(callerJwt));
  });

  it('rest.from includes caller JWT in Authorization header', async () => {
    const fetchCalls = [];
    const mockFetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, json: async () => ([]) };
    };

    const client = buildBoaClient(callerJwt, 'authenticated', {
      apiUrl,
      fetch: mockFetch,
    });

    await client.rest.from('todos').select('*');

    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes(apiUrl));
    assert.ok(
      fetchCalls[0].opts.headers.Authorization?.includes(callerJwt)
        || fetchCalls[0].opts.headers.authorization?.includes(callerJwt),
      'caller JWT should be in Authorization header'
    );
  });

  it('boa.db() uses service-role pool independent of ctx.db caller pool', async () => {
    const poolCalls = [];
    const mockCreatePool = (role) => {
      const pool = { query: mock.fn(), role };
      poolCalls.push(pool);
      return pool;
    };

    const client = buildBoaClient(callerJwt, 'authenticated', {
      apiUrl,
      createServicePool: mockCreatePool,
    });

    const pool = await client.db();
    assert.equal(pool.role, 'service_role');
    assert.equal(poolCalls.length, 1);
  });

  it('boa.db() called multiple times reuses the same pool instance', async () => {
    const mockCreatePool = (role) => ({ query: mock.fn(), role });

    const client = buildBoaClient(callerJwt, 'authenticated', {
      apiUrl,
      createServicePool: mockCreatePool,
    });

    const pool1 = await client.db();
    const pool2 = await client.db();
    assert.strictEqual(pool1, pool2);
  });
});

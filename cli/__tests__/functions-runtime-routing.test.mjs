import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../lib/functions/runtime/handler.mjs';

function makeApiGwEvent(path, { headers = {}, body = null, method = 'GET' } = {}) {
  return {
    httpMethod: method,
    path,
    queryStringParameters: { foo: 'bar' },
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : null,
    requestContext: { stage: 'prod' },
  };
}

function makeDirectInvokeEvent(name, payload = {}) {
  return {
    _boaInternal: { name },
    payload,
  };
}

describe('functions runtime routing', () => {
  it('public function via API Gateway calls user handler and returns response', async () => {
    const userHandler = mock.fn(async (req, ctx) => ({
      status: 200,
      body: { greeting: 'hello' },
    }));

    const registry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const event = makeApiGwEvent('/functions/v1/hello');
    const result = await handler(event, { registry, handlers: { hello: userHandler } });

    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body);
    assert.deepEqual(body, { greeting: 'hello' });
    assert.equal(userHandler.mock.calls.length, 1);
  });

  it('private function via API Gateway with anon key returns 404 PostgREST-shaped error', async () => {
    const registry = {
      hello: { visibility: 'private', timeout: 30, memory: 256 },
    };

    const event = makeApiGwEvent('/functions/v1/hello', {
      headers: { apikey: 'anon-key-value' },
    });
    const result = await handler(event, { registry, handlers: {} });

    assert.equal(result.statusCode, 404);
    const body = JSON.parse(result.body);
    assert.equal(body.code, 'PGRST116');
    assert.equal(body.hint, null);
    assert.equal(body.details, null);
    assert.ok(body.message);
  });

  it('private function via API Gateway with service role key still returns 404', async () => {
    const registry = {
      hello: { visibility: 'private', timeout: 30, memory: 256 },
    };

    const event = makeApiGwEvent('/functions/v1/hello', {
      headers: { apikey: 'service-role-key-value' },
    });
    const result = await handler(event, { registry, handlers: {} });

    assert.equal(result.statusCode, 404);
    const body = JSON.parse(result.body);
    assert.equal(body.code, 'PGRST116');
  });

  it('private function via direct invoke (_boaInternal) calls user handler', async () => {
    const userHandler = mock.fn(async (req, ctx) => ({
      status: 200,
      body: { ok: true },
    }));

    const registry = {
      hello: { visibility: 'private', timeout: 30, memory: 256 },
    };

    const event = makeDirectInvokeEvent('hello', { data: 42 });
    const result = await handler(event, { registry, handlers: { hello: userHandler } });

    assert.equal(userHandler.mock.calls.length, 1);
    assert.equal(result.statusCode, 200);
  });

  it('unknown function via API Gateway returns 404 PostgREST-shaped error', async () => {
    const registry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const event = makeApiGwEvent('/functions/v1/unknown');
    const result = await handler(event, { registry, handlers: {} });

    assert.equal(result.statusCode, 404);
    const body = JSON.parse(result.body);
    assert.equal(body.code, 'PGRST116');
    assert.equal(body.hint, null);
    assert.equal(body.details, null);
  });

  it('user handler throwing returns 500 with generic PostgREST-shaped error', async () => {
    const userHandler = mock.fn(async () => {
      throw new Error('something broke internally');
    });

    const registry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const event = makeApiGwEvent('/functions/v1/hello');
    const result = await handler(event, { registry, handlers: { hello: userHandler } });

    assert.equal(result.statusCode, 500);
    const body = JSON.parse(result.body);
    assert.equal(body.code, 'PGRST116');
    assert.ok(body.message);
    assert.ok(!body.message.includes('something broke internally'));
    assert.equal(body.hint, null);
    assert.equal(body.details, null);
  });

  it('user handler throwing does not leak JWT or secrets in error response', async () => {
    const jwtValue = 'eyJhbGciOiJIUzI1NiJ9.secret-token';
    const secretValue = 'sk_live_supersecret';

    const userHandler = mock.fn(async () => {
      throw new Error(`Failed with jwt=${jwtValue} secret=${secretValue}`);
    });

    const registry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const event = makeApiGwEvent('/functions/v1/hello', {
      headers: { authorization: `Bearer ${jwtValue}` },
    });

    process.env.STRIPE_SECRET_KEY = secretValue;
    const result = await handler(event, { registry, handlers: { hello: userHandler } });
    delete process.env.STRIPE_SECRET_KEY;

    const responseText = result.body;
    assert.ok(!responseText.includes(jwtValue));
    assert.ok(!responseText.includes(secretValue));
  });

  it('public function via API Gateway passes req with method, path, query, headers, body', async () => {
    let capturedReq;
    const userHandler = mock.fn(async (req, ctx) => {
      capturedReq = req;
      return { status: 200, body: {} };
    });

    const registry = {
      hello: { visibility: 'public', timeout: 30, memory: 256 },
    };

    const event = makeApiGwEvent('/functions/v1/hello', {
      method: 'POST',
      body: { name: 'world' },
      headers: { 'x-custom': 'test' },
    });
    await handler(event, { registry, handlers: { hello: userHandler } });

    assert.equal(capturedReq.method, 'POST');
    assert.ok(capturedReq.path);
    assert.deepEqual(capturedReq.query, { foo: 'bar' });
    assert.ok(capturedReq.headers);
    assert.deepEqual(capturedReq.body, { name: 'world' });
  });

  it('direct invoke event passes payload as req.body', async () => {
    let capturedReq;
    const userHandler = mock.fn(async (req, ctx) => {
      capturedReq = req;
      return { status: 200, body: {} };
    });

    const registry = {
      hello: { visibility: 'private', timeout: 30, memory: 256 },
    };

    const payload = { userId: 'abc', action: 'cleanup' };
    const event = makeDirectInvokeEvent('hello', payload);
    await handler(event, { registry, handlers: { hello: userHandler } });

    assert.deepEqual(capturedReq.body, payload);
  });
});

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildCtx } from '../lib/functions/runtime/ctx.mjs';

const JWT_SECRET = 'test-jwt-secret-key-for-signing';
const ANON_KEY = 'anon-key-value';
const SERVICE_ROLE_KEY = 'service-role-key-value';

import { createHmac } from 'node:crypto';

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwtSync(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const content = `${base64url(header)}.${base64url(payload)}`;
  if (secret) {
    const sig = createHmac('sha256', secret).update(content).digest('base64url');
    return `${content}.${sig}`;
  }
  return `${content}.fake-signature`;
}

const registry = {
  hello: {
    visibility: 'public',
    timeout: 30,
    memory: 256,
    env: { APP_MODE: 'production', DEBUG: 'false' },
  },
};

const ctxOpts = {
  jwtSecret: JWT_SECRET,
  anonKey: ANON_KEY,
  serviceRoleKey: SERVICE_ROLE_KEY,
  registry,
  functionName: 'hello',
};

describe('functions runtime ctx - token table', () => {
  it('no auth headers: role=anon, userId empty, email empty', () => {
    const event = { headers: {} };
    const ctx = buildCtx(event, ctxOpts);

    assert.equal(ctx.role, 'anon');
    assert.equal(ctx.userId, '');
    assert.equal(ctx.email, '');
  });

  it('Bearer user JWT: role=authenticated, userId=sub, email=claim', () => {
    const token = makeJwtSync({
      sub: 'user-uuid-123',
      email: 'user@example.com',
      role: 'authenticated',
    }, JWT_SECRET);
    const event = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildCtx(event, ctxOpts);

    assert.equal(ctx.role, 'authenticated');
    assert.equal(ctx.userId, 'user-uuid-123');
    assert.equal(ctx.email, 'user@example.com');
  });

  it('apikey anon key only: role=anon, userId empty', () => {
    const event = {
      headers: { apikey: ANON_KEY },
    };
    const ctx = buildCtx(event, ctxOpts);

    assert.equal(ctx.role, 'anon');
    assert.equal(ctx.userId, '');
  });

  it('apikey service role key only: role=service_role, userId empty', () => {
    const event = {
      headers: { apikey: SERVICE_ROLE_KEY },
    };
    const ctx = buildCtx(event, ctxOpts);

    assert.equal(ctx.role, 'service_role');
    assert.equal(ctx.userId, '');
  });

  it('both Bearer JWT and service role apikey: JWT wins for userId, service key elevates role', () => {
    const token = makeJwtSync({
      sub: 'user-uuid-456',
      email: 'admin@example.com',
      role: 'authenticated',
    }, JWT_SECRET);
    const event = {
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SERVICE_ROLE_KEY,
      },
    };
    const ctx = buildCtx(event, ctxOpts);

    assert.equal(ctx.userId, 'user-uuid-456');
    assert.equal(ctx.role, 'service_role');
  });

  it('malformed JWT: falls back to anon without throwing', () => {
    const event = {
      headers: { authorization: 'Bearer not.a.valid.jwt' },
    };

    assert.doesNotThrow(() => {
      const ctx = buildCtx(event, ctxOpts);
      assert.equal(ctx.role, 'anon');
    });
  });
});

describe('functions runtime ctx - lazy pool', () => {
  it('ctx.db accessed first time creates DSQL pool with caller role', () => {
    const dsqlSignerCalls = [];
    const mockOpts = {
      ...ctxOpts,
      createPool: (role, jwt) => {
        dsqlSignerCalls.push({ role, jwt });
        return { query: mock.fn() };
      },
    };

    const token = makeJwtSync({
      sub: 'user-uuid-789',
      email: 'test@test.com',
      role: 'authenticated',
    }, JWT_SECRET);
    const event = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildCtx(event, mockOpts);

    assert.equal(dsqlSignerCalls.length, 0);
    const _pool = ctx.db;
    assert.equal(dsqlSignerCalls.length, 1);
    assert.equal(dsqlSignerCalls[0].role, 'authenticated');
  });

  it('ctx.db never accessed means no DSQL pool created', () => {
    const dsqlSignerCalls = [];
    const mockOpts = {
      ...ctxOpts,
      createPool: (role, jwt) => {
        dsqlSignerCalls.push({ role, jwt });
        return { query: mock.fn() };
      },
    };

    const event = { headers: {} };
    const ctx = buildCtx(event, mockOpts);

    assert.equal(dsqlSignerCalls.length, 0);
  });
});

describe('functions runtime ctx - security', () => {
  it('JWT with role=service_role but wrong signing key: rejected, falls back to anon', () => {
    const token = makeJwtSync({
      sub: 'attacker-uuid',
      email: 'attacker@evil.com',
      role: 'service_role',
    });
    const event = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildCtx(event, {
      ...ctxOpts,
      jwtSecret: 'different-secret-than-used-to-sign',
    });

    assert.equal(ctx.role, 'anon');
    assert.equal(ctx.userId, '');
  });

  it('ctx.role mutated mid-execution does not affect already-created pool', () => {
    const poolRoles = [];
    const mockOpts = {
      ...ctxOpts,
      createPool: (role) => {
        poolRoles.push(role);
        return { query: mock.fn(), boundRole: role };
      },
    };

    const event = {
      headers: { apikey: SERVICE_ROLE_KEY },
    };
    const ctx = buildCtx(event, mockOpts);

    const pool = ctx.db;
    assert.equal(pool.boundRole, 'service_role');

    ctx.role = 'anon';

    const poolAgain = ctx.db;
    assert.equal(poolAgain.boundRole, 'service_role');
  });
});

describe('functions runtime ctx - env and logger', () => {
  it('ctx.env contains merged env vars from registry', () => {
    const event = { headers: {} };
    const ctx = buildCtx(event, ctxOpts);

    assert.equal(ctx.env.APP_MODE, 'production');
    assert.equal(ctx.env.DEBUG, 'false');
  });

  it('ctx.logger produces structured JSON logs with function name', () => {
    const event = { headers: {} };
    const ctx = buildCtx(event, ctxOpts);

    const originalLog = console.log;
    let loggedOutput = '';
    console.log = (msg) => { loggedOutput = msg; };

    ctx.logger.info('test message', { extra: 'data' });

    console.log = originalLog;

    const parsed = JSON.parse(loggedOutput);
    assert.equal(parsed.function, 'hello');
    assert.equal(parsed.msg, 'test message');
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.extra, 'data');
  });
});

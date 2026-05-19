import { createHmac } from 'node:crypto';
import { buildLogger } from './logger.mjs';

function verifyHs256(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const expected = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (expected !== sigB64) return null;
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch {
    return null;
  }
}

function extractAuth(event, opts) {
  const headers = event.headers || {};
  const jwtSecret = opts.jwtSecret || '';
  const anonKey = opts.anonKey || '';
  const serviceRoleKey = opts.serviceRoleKey || '';

  let role = 'anon';
  let userId = '';
  let email = '';
  let jwt = '';

  const authHeader = headers.authorization || headers.Authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const claims = jwtSecret ? verifyHs256(token, jwtSecret) : null;
    if (claims) {
      role = claims.role || 'authenticated';
      userId = claims.sub || '';
      email = claims.email || '';
      jwt = token;
    }
  }

  const apikey = headers.apikey || '';
  if (apikey === serviceRoleKey) {
    role = 'service_role';
  } else if (apikey === anonKey && role === 'anon') {
    // stays anon
  }

  return { role, userId, email, jwt };
}

function buildEnv(functionEntry) {
  if (!functionEntry) return {};
  return { ...(functionEntry.env || {}) };
}

export function buildCtx(event, opts) {
  const { registry, functionName, createPool } = opts;
  const { role, userId, email, jwt } = extractAuth(event, opts);

  let _pool = null;
  const capturedRole = role;
  const capturedJwt = jwt;

  return {
    role,
    userId,
    email,
    jwt,
    get db() {
      if (!_pool) {
        if (createPool) {
          _pool = createPool(capturedRole, capturedJwt);
        } else {
          _pool = getCallerPool(capturedRole, capturedJwt);
        }
      }
      return _pool;
    },
    logger: buildLogger(functionName),
    env: buildEnv(registry[functionName]),
  };
}

function getCallerPool(role, jwt) {
  const endpoint = process.env.DSQL_ENDPOINT;
  const region = process.env.REGION_NAME;
  return { endpoint, region, role, jwt, query() {} };
}

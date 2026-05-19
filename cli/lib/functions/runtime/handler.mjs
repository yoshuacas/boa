import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCtx } from './ctx.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let defaultRegistry;
try {
  defaultRegistry = JSON.parse(
    readFileSync(join(__dirname, '_registry.json'), 'utf8'),
  );
} catch {
  defaultRegistry = {};
}

function pgrstError(status, message, code) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, code, hint: null, details: null }),
  };
}

function parseBody(event) {
  if (event._boaInternal) return event.payload || {};
  if (!event.body) return {};
  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body);
    } catch {
      return event.body;
    }
  }
  return event.body;
}

export async function handler(event, deps) {
  const registry = deps?.registry || defaultRegistry;
  const handlers = deps?.handlers || null;
  const ctxOpts = deps?.ctxOpts || {};

  let functionName;
  let isDirectInvoke = false;

  if (event._boaInternal) {
    isDirectInvoke = true;
    functionName = event._boaInternal.name;
  } else {
    const pathMatch = (event.path || '').match(/\/functions\/v1\/([^/]+)/);
    functionName = pathMatch ? pathMatch[1] : null;
  }

  if (!functionName || !registry[functionName]) {
    return pgrstError(404, `Function '${functionName || 'unknown'}' not found`, 'PGRST116');
  }

  const fnConfig = registry[functionName];

  if (fnConfig.visibility === 'private' && !isDirectInvoke) {
    return pgrstError(404, `Function '${functionName}' not found`, 'PGRST116');
  }

  const req = {
    method: event.httpMethod || event._boaInternal?.method || 'POST',
    path: event.path || '',
    query: event.queryStringParameters || {},
    headers: event.headers || {},
    body: parseBody(event),
  };

  const ctx = buildCtx(event, {
    jwtSecret: ctxOpts.jwtSecret || process.env.JWT_SECRET || '',
    anonKey: ctxOpts.anonKey || process.env.ANON_KEY || '',
    serviceRoleKey: ctxOpts.serviceRoleKey || process.env.SERVICE_ROLE_KEY || '',
    registry,
    functionName,
    createPool: ctxOpts.createPool || undefined,
  });

  let fn;
  if (handlers && handlers[functionName]) {
    fn = handlers[functionName];
  } else {
    const mod = await import(`./functions/${functionName}/index.mjs`);
    fn = mod.default;
  }

  try {
    const result = await fn(req, ctx);
    return {
      statusCode: result.status || 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.body),
    };
  } catch (err) {
    ctx.logger.error('Unhandled function error', {
      error: err.message,
      stack: err.stack,
    });
    return pgrstError(500, 'Internal server error', 'PGRST116');
  }
}

import { createPgrest } from 'pgrest-lambda';
import { handler as uploadHandler } from './presigned-upload.mjs';

const pgrest = createPgrest();

// Bridge Function URL v2.0 events to the v1.0 format pgrest-lambda expects.
// API Gateway REST events have event.path and event.requestContext.authorizer;
// Function URL events have event.rawPath and no authorizer context.
// We decode the JWT from the Authorization header to populate the authorizer
// context that pgrest-lambda relies on for role/userId/email.
function normalizeEvent(raw) {
  if (raw.path) return raw; // Already v1.0 (API Gateway REST)

  const headers = raw.headers || {};
  // Extract role/userId/email from JWT if present
  let role = 'anon';
  let userId = '';
  let email = '';
  const authHeader = headers.authorization || headers.Authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    try {
      const payload = JSON.parse(
        Buffer.from(authHeader.slice(7).split('.')[1], 'base64url').toString()
      );
      role = payload.role || 'authenticated';
      userId = payload.sub || '';
      email = payload.email || '';
    } catch { /* malformed JWT — stay anon */ }
  }
  // Also check apikey header for service_role or anon key
  const apikey = headers.apikey || '';
  if (apikey && role === 'anon') {
    try {
      const payload = JSON.parse(
        Buffer.from(apikey.split('.')[1], 'base64url').toString()
      );
      if (payload.role === 'service_role') role = 'service_role';
    } catch { /* not a JWT apikey */ }
  }

  return {
    ...raw,
    path: raw.rawPath || '/',
    httpMethod: raw.requestContext?.http?.method || 'GET',
    headers,
    queryStringParameters: raw.queryStringParameters || null,
    body: raw.body || null,
    isBase64Encoded: raw.isBase64Encoded || false,
    requestContext: {
      ...raw.requestContext,
      authorizer: { role, userId, email },
    },
  };
}

export async function handler(rawEvent) {
  const event = normalizeEvent(rawEvent);
  const path = event.path || '';

  // Presigned upload/download routes
  if (path === '/upload' || path === '/download') {
    return uploadHandler(event);
  }

  // Auth + REST engine (PostgREST-compatible API, GoTrue-compatible auth)
  return pgrest.handler(event);
}

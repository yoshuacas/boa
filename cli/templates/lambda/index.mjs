import { createPgrest } from 'pgrest-lambda';
import { handler as uploadHandler } from './presigned-upload.mjs';

function getStorageOpenApiPaths(baseUrl) {
  const storageUrl = baseUrl.replace(/\/rest\/v1\/?$/, '');
  const server = [{ url: storageUrl }];
  const tag = 'Storage';

  return {
    paths: {
      '/upload': {
        servers: server,
        post: {
          tags: [tag],
          summary: 'Get presigned upload URL',
          description: 'Generate a presigned S3 URL for file upload.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['filename', 'contentType'],
                  properties: {
                    filename: { type: 'string' },
                    contentType: { type: 'string', example: 'image/jpeg' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Presigned URL generated', content: { 'application/json': { schema: { $ref: '#/components/schemas/UploadResponse' } } } },
            400: { description: 'Validation error' },
          },
        },
      },
      '/download': {
        servers: server,
        get: {
          tags: [tag],
          summary: 'Get presigned download URL',
          description: 'Generate a presigned S3 URL for file download.',
          parameters: [{
            name: 'key',
            in: 'query',
            required: true,
            description: 'S3 object key',
            schema: { type: 'string' },
          }],
          responses: {
            200: { description: 'Presigned URL generated', content: { 'application/json': { schema: { $ref: '#/components/schemas/DownloadResponse' } } } },
            400: { description: 'Missing key parameter' },
            403: { description: 'Access denied' },
          },
        },
      },
    },
    schemas: {
      UploadResponse: {
        type: 'object',
        properties: {
          uploadUrl: { type: 'string', format: 'uri' },
          key: { type: 'string' },
          expiresIn: { type: 'integer', example: 3600 },
          maxSizeBytes: { type: 'integer', example: 10485760 },
          message: { type: 'string' },
        },
      },
      DownloadResponse: {
        type: 'object',
        properties: {
          downloadUrl: { type: 'string', format: 'uri' },
          expiresIn: { type: 'integer', example: 3600 },
        },
      },
    },
  };
}

// CORS allowlist from the deployment parameter (see backend.yaml
// AllowedOrigins). Empty -> pgrest-lambda emits no CORS headers.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const pgrest = createPgrest({
  contributions: [getStorageOpenApiPaths],
  cors: ALLOWED_ORIGINS.length > 0
    ? { allowedOrigins: ALLOWED_ORIGINS }
    : { allowedOrigins: [] },
});

// ALB requires statusDescription in responses (e.g. "200 OK").
const STATUS_DESCRIPTIONS = {
  200: '200 OK', 201: '201 Created', 204: '204 No Content',
  301: '301 Moved Permanently', 302: '302 Found', 304: '304 Not Modified',
  400: '400 Bad Request', 401: '401 Unauthorized', 403: '403 Forbidden',
  404: '404 Not Found', 405: '405 Method Not Allowed', 406: '406 Not Acceptable',
  409: '409 Conflict', 422: '422 Unprocessable Entity',
  500: '500 Internal Server Error', 502: '502 Bad Gateway', 503: '503 Service Unavailable',
};

function addStatusDescription(response) {
  if (!response.statusDescription) {
    response.statusDescription = STATUS_DESCRIPTIONS[response.statusCode]
      || `${response.statusCode} Unknown`;
  }
  return response;
}

// Bridge ALB and Function URL events to the v1.0 format pgrest-lambda expects.
// API Gateway REST events have event.path and event.requestContext.authorizer;
// ALB events have event.path and event.requestContext.elb (no authorizer);
// Function URL events have event.rawPath and no authorizer context.
// We decode the JWT from the Authorization header to populate the authorizer
// context that pgrest-lambda relies on for role/userId/email.
function normalizeEvent(raw) {
  // Already v1.0 with authorizer context (API Gateway REST)
  if (raw.path && raw.requestContext?.authorizer?.role) return raw;

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

  // ALB may base64-encode the body — decode it so downstream
  // handlers can JSON.parse(event.body) directly.
  let body = raw.body || null;
  if (body && raw.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf-8');
  }

  return {
    ...raw,
    path: raw.path || raw.rawPath || '/',
    httpMethod: raw.httpMethod || raw.requestContext?.http?.method || 'GET',
    headers,
    queryStringParameters: raw.queryStringParameters || null,
    body,
    isBase64Encoded: false,
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
    return addStatusDescription(await uploadHandler(event));
  }

  // Auth + REST engine (PostgREST-compatible API, GoTrue-compatible auth)
  return addStatusDescription(await pgrest.handler(event));
}

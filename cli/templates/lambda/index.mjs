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

const pgrest = createPgrest({
  contributions: [getStorageOpenApiPaths],
});

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
  // Origin secret check — reject requests not from CloudFront.
  // Only applies to Function URL events (no event.path).
  // API Gateway events (have event.path) bypass this check.
  if (!rawEvent.path && process.env.ORIGIN_SECRET) {
    const headers = rawEvent.headers || {};
    if (headers['x-origin-verify'] !== process.env.ORIGIN_SECRET) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Forbidden' }),
      };
    }
  }

  const event = normalizeEvent(rawEvent);
  const path = event.path || '';

  // Presigned upload/download routes
  if (path === '/upload' || path === '/download') {
    return uploadHandler(event);
  }

  // Auth + REST engine (PostgREST-compatible API, GoTrue-compatible auth)
  return pgrest.handler(event);
}

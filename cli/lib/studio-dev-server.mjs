/**
 * studio-dev-server.mjs
 *
 * Minimal HTTP server that wraps the built Lambda handler for local Studio dev.
 * Translates Node.js HTTP requests → API Gateway HTTP API v2 event format,
 * calls the handler, and translates the response back to HTTP.
 *
 * Usage: node studio-dev-server.mjs <path-to-.lambda/index.js> <port>
 */

import http from 'node:http';
import { createRequire } from 'node:module';

const lambdaPath = process.argv[2];
const port = parseInt(process.argv[3] || '3099', 10);

if (!lambdaPath) {
  console.error('Usage: studio-dev-server.mjs <lambda-path> <port>');
  process.exit(1);
}

// CJS lambda bundle — use createRequire so it resolves node_modules
// relative to its own location (studio/.lambda/), which finds studio/node_modules
const require = createRequire(import.meta.url);
const { handler } = require(lambdaPath);

const server = http.createServer(async (req, res) => {
  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf-8');

  // Parse URL
  const url = new URL(req.url, `http://localhost:${port}`);

  // Parse query string params
  const queryParams = {};
  for (const [k, v] of url.searchParams) queryParams[k] = v;

  // Parse cookies from Cookie header
  const cookieHeader = req.headers['cookie'];
  const cookies = cookieHeader ? [cookieHeader] : [];

  // Flatten headers (Node.js may give arrays for some)
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k] = Array.isArray(v) ? v.join(', ') : v;
  }

  // Build API Gateway HTTP API v2 event
  const event = {
    version: '2.0',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    queryStringParameters: Object.keys(queryParams).length ? queryParams : undefined,
    headers,
    cookies,
    body: rawBody || undefined,
    isBase64Encoded: false,
    requestContext: {
      http: {
        method: req.method.toUpperCase(),
        path: url.pathname,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: req.headers['user-agent'] || '',
      },
      accountId: 'local',
      apiId: 'local',
      stage: '$default',
      requestId: `local-${Date.now()}`,
    },
  };

  try {
    const result = await handler(event);

    // Set response headers
    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, String(v));
      }
    }

    // API Gateway v2 returns cookies as an array — map to Set-Cookie headers
    if (result.cookies?.length) {
      res.setHeader('Set-Cookie', result.cookies);
    }

    res.statusCode = result.statusCode ?? 200;
    res.end(result.body ?? '');
  } catch (err) {
    console.error('[studio-dev] unhandled error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`  [studio api] http://localhost:${port}`);
});

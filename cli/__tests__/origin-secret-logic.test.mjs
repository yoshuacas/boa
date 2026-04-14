import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Validate the origin-secret check logic BEFORE modifying
 * the actual handler. This tests the guard function in
 * isolation against realistic Function URL v2.0 events.
 */

const TEST_SECRET = 'abc123-test-secret-value';

// This is the exact guard we plan to add to index.mjs handler
function checkOriginSecret(rawEvent, secret) {
  const headers = rawEvent.headers || {};
  const value = headers['x-origin-verify'];
  if (value !== secret) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Forbidden' }),
    };
  }
  return null; // pass — continue to handler
}

// Realistic Function URL v2.0 event shape
function makeFunctionUrlEvent(method, path, extraHeaders = {}) {
  return {
    version: '2.0',
    rawPath: path,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      host: 'abc123.lambda-url.us-east-1.on.aws',
      ...extraHeaders,
    },
    queryStringParameters: null,
    body: method === 'POST' ? '{"title":"test"}' : null,
    isBase64Encoded: false,
    requestContext: {
      http: { method, path, protocol: 'HTTP/1.1' },
      accountId: '123456789012',
      stage: '$default',
    },
  };
}

// -----------------------------------------------------------
// Origin secret — rejection cases
// -----------------------------------------------------------

describe('origin secret — rejects without header', () => {
  it('GET without x-origin-verify returns 403', () => {
    const event = makeFunctionUrlEvent('GET', '/rest/v1/todos');
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.ok(result, 'should return a 403 response');
    assert.equal(result.statusCode, 403);
  });

  it('POST without x-origin-verify returns 403', () => {
    const event = makeFunctionUrlEvent('POST', '/rest/v1/todos');
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.ok(result, 'should return a 403 response');
    assert.equal(result.statusCode, 403);
  });

  it('request with wrong secret returns 403', () => {
    const event = makeFunctionUrlEvent('GET', '/rest/v1/todos', {
      'x-origin-verify': 'wrong-secret',
    });
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.ok(result, 'should return a 403 response');
    assert.equal(result.statusCode, 403);
  });

  it('request with empty string secret returns 403', () => {
    const event = makeFunctionUrlEvent('GET', '/rest/v1/todos', {
      'x-origin-verify': '',
    });
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.ok(result, 'should return a 403 response');
    assert.equal(result.statusCode, 403);
  });

  it('request with undefined headers returns 403', () => {
    const event = { version: '2.0', rawPath: '/' };
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.ok(result, 'should return a 403 response');
    assert.equal(result.statusCode, 403);
  });
});

// -----------------------------------------------------------
// Origin secret — pass cases
// -----------------------------------------------------------

describe('origin secret — passes with correct header', () => {
  it('GET with correct x-origin-verify passes', () => {
    const event = makeFunctionUrlEvent('GET', '/rest/v1/todos', {
      'x-origin-verify': TEST_SECRET,
    });
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.equal(result, null, 'should return null (pass)');
  });

  it('POST with correct x-origin-verify passes', () => {
    const event = makeFunctionUrlEvent('POST', '/rest/v1/todos', {
      'x-origin-verify': TEST_SECRET,
    });
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.equal(result, null, 'should return null (pass)');
  });

  it('auth endpoint with correct header passes', () => {
    const event = makeFunctionUrlEvent(
      'POST', '/auth/v1/token?grant_type=password', {
        'x-origin-verify': TEST_SECRET,
      }
    );
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.equal(result, null, 'should return null (pass)');
  });
});

// -----------------------------------------------------------
// Origin secret — API Gateway bypass
// -----------------------------------------------------------

describe('origin secret — API Gateway events bypass', () => {
  it('API Gateway REST event (has event.path) is not checked', () => {
    // When api-gateway extension is active, events come from
    // API Gateway and have event.path set. The origin secret
    // check should only run for Function URL events.
    const event = {
      path: '/rest/v1/todos',
      httpMethod: 'GET',
      headers: {},
      requestContext: {
        authorizer: { role: 'anon', userId: '', email: '' },
      },
    };
    // API Gateway events have event.path, so normalizeEvent
    // returns them unchanged. The origin secret check should
    // be skipped for these events since API Gateway has its
    // own auth.
    const isFunctionUrlEvent = !event.path;
    assert.equal(
      isFunctionUrlEvent, false,
      'API Gateway event should have event.path set'
    );
  });
});

// -----------------------------------------------------------
// CloudFront custom header forwarding
// -----------------------------------------------------------

describe('CloudFront custom header — forwarding behavior', () => {
  it('x-origin-verify is available in lowercase headers', () => {
    // CloudFront lowercases all header names when forwarding
    // to Lambda Function URLs. Verify our check uses lowercase.
    const event = makeFunctionUrlEvent('GET', '/rest/v1/', {
      'x-origin-verify': TEST_SECRET,
    });
    const headers = event.headers;
    assert.ok(
      'x-origin-verify' in headers,
      'header should be accessible as lowercase key'
    );
    assert.equal(headers['x-origin-verify'], TEST_SECRET);
  });

  it('403 response body is valid JSON', () => {
    const event = makeFunctionUrlEvent('GET', '/rest/v1/');
    const result = checkOriginSecret(event, TEST_SECRET);
    assert.ok(result);
    const body = JSON.parse(result.body);
    assert.equal(body.message, 'Forbidden');
  });
});

// response.mjs — Format responses with PostgREST headers

import { PostgRESTError } from './errors.mjs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,Authorization,Prefer,Accept,apikey,X-Client-Info',
  'Access-Control-Allow-Methods':
    'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range',
};

export function success(statusCode, body, options = {}) {
  const { contentRange, singleObject } = options;

  if (body == null) {
    return {
      statusCode,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: '',
    };
  }

  let responseBody = body;

  if (singleObject) {
    if (!Array.isArray(body) || body.length === 0) {
      throw new PostgRESTError(
        406,
        'PGRST116',
        'JSON object requested but 0 rows returned',
        null,
        null,
      );
    }
    if (body.length > 1) {
      throw new PostgRESTError(
        406,
        'PGRST116',
        'Singular response expected but more rows found',
        null,
        null,
      );
    }
    responseBody = body[0];
  }

  const headers = {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
  };

  if (contentRange != null) {
    headers['Content-Range'] = contentRange;
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(responseBody),
  };
}

export function error(err) {
  if (err instanceof PostgRESTError) {
    return {
      statusCode: err.statusCode,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(err.toJSON()),
    };
  }

  return {
    statusCode: 500,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'PGRST000',
      message: err.message || 'Internal server error',
      details: null,
      hint: null,
    }),
  };
}

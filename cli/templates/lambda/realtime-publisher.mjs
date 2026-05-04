// Publishes database-change events to AppSync Events after a
// successful REST mutation. Inspects the pgrest-lambda response
// rather than hooking internals — keeps the module self-contained
// and free of pgrest-lambda version coupling.
//
// SigV4-signs the request to AppSync over HTTPS. Runs best-effort:
// a publish failure must not break the API response, so errors are
// logged and swallowed.

import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';

const HTTP_ENDPOINT = process.env.REALTIME_HTTP_ENDPOINT || '';
const REGION = process.env.REGION_NAME || 'us-east-1';

// Map { path, method } → { table, op } for successful mutations.
// Returns null if the request was not a realtime-eligible mutation.
export function classifyMutation(path, method, statusCode) {
  if (statusCode < 200 || statusCode >= 300) return null;
  const match = (path || '').match(/^\/rest\/v1\/([^/?]+)/);
  if (!match) return null;
  const table = match[1];
  const m = (method || '').toUpperCase();
  if (m === 'POST') return { table, op: 'INSERT' };
  if (m === 'PATCH' || m === 'PUT') return { table, op: 'UPDATE' };
  if (m === 'DELETE') return { table, op: 'DELETE' };
  return null;
}

// pgrest-lambda returns the affected rows in the body when Prefer:
// return=representation is set, which @supabase/supabase-js does by
// default. Parse it; return [] if the body is empty or not JSON.
export function parseRows(body) {
  if (!body) return [];
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return [parsed];
  } catch {
    /* plain-text or non-JSON — no rows to publish */
  }
  return [];
}

async function signAndFetch(endpoint, body) {
  const url = new URL(`https://${endpoint}/event`);
  const request = new HttpRequest({
    method: 'POST',
    protocol: 'https:',
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      host: url.hostname,
      'content-type': 'application/json',
    },
    body,
  });
  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: REGION,
    service: 'appsync',
    sha256: Sha256,
  });
  const signed = await signer.sign(request);
  const res = await fetch(url, {
    method: 'POST',
    headers: signed.headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AppSync publish ${res.status}: ${text}`);
  }
}

// Publish one event per row to /db/public/{table}/{op}. Keeps the
// call count bounded by the number of rows the mutation returned.
export async function publishPostgresChanges(table, op, rows) {
  if (!HTTP_ENDPOINT) return;
  if (!rows.length) return;

  const channel = `/db/public/${table}/${op}`;
  const events = rows.map((row) => JSON.stringify({
    schema: 'public',
    table,
    type: op,
    record: op === 'DELETE' ? null : row,
    old_record: op === 'DELETE' ? row : null,
    commit_timestamp: new Date().toISOString(),
  }));

  // AppSync Events accepts up to 5 events per publish call.
  for (let i = 0; i < events.length; i += 5) {
    const batch = events.slice(i, i + 5);
    const body = JSON.stringify({ channel, events: batch });
    await signAndFetch(HTTP_ENDPOINT, body);
  }
}

// Entry point called from index.mjs after pgrest.handler returns.
// Best-effort: never throws.
export async function publishFromResponse(event, response) {
  try {
    const mutation = classifyMutation(
      event.path,
      event.httpMethod,
      response.statusCode,
    );
    if (!mutation) return;
    const rows = parseRows(response.body);
    await publishPostgresChanges(mutation.table, mutation.op, rows);
  } catch (err) {
    console.error('[realtime] publish failed:', err.message);
  }
}

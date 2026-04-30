// Shared CORS origin allowlist logic for the BOA Lambda handlers.
//
// Production deploys set an explicit ALLOWED_ORIGINS list
// (comma-delimited) via the CloudFormation AllowedOrigins parameter.
// When no list is configured we default to allowing any
// http://localhost:* and http://127.0.0.1:* origin — those addresses
// only reach the developer's own machine, so there is no cross-user
// threat. Requiring an explicit config just to run `npx vite` on
// localhost is pure friction.

const LOCALHOST_ORIGIN =
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function parseAllowedOrigins(raw) {
  return (raw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

// Returns true when the request Origin should receive CORS headers.
// `allowlist` is an array from parseAllowedOrigins.
export function isAllowedOrigin(origin, allowlist) {
  if (!origin) return false;
  if (allowlist.includes(origin)) return true;
  if (allowlist.length === 0 && LOCALHOST_ORIGIN.test(origin)) {
    return true;
  }
  return false;
}

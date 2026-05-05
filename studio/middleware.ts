import { NextRequest, NextResponse } from 'next/server';

// ── Cognito JWKS verification ────────────────────────────────
// Runs in the Edge runtime — no Node.js APIs, no server secrets.
// Cognito's JWKS endpoint is public; verification only needs the pool ID.

interface JwkKey { kid: string; kty: string; n: string; e: string; }

let jwksCache: { keys: JwkKey[] } | null = null;
let jwksCacheAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchJwks(region: string, poolId: string): Promise<{ keys: JwkKey[] } | null> {
  if (jwksCache && Date.now() - jwksCacheAt < JWKS_TTL_MS) return jwksCache;
  try {
    const res = await fetch(
      `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`,
    );
    if (!res.ok) return null;
    jwksCache = await res.json() as { keys: JwkKey[] };
    jwksCacheAt = Date.now();
    return jwksCache;
  } catch {
    return null;
  }
}

function b64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  const binary = atob(padded);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

async function verifyCognitoJwt(token: string): Promise<boolean> {
  const region = process.env.NEXT_PUBLIC_STUDIO_COGNITO_REGION;
  const poolId = process.env.NEXT_PUBLIC_STUDIO_COGNITO_USER_POOL_ID;
  if (!region || !poolId) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(new TextDecoder().decode(b64url(headerB64)));
    const payload = JSON.parse(new TextDecoder().decode(b64url(payloadB64)));

    if (payload.exp < Date.now() / 1000) return false;

    const jwks = await fetchJwks(region, poolId);
    if (!jwks) return false;

    const jwk = jwks.keys.find(k => k.kid === header.kid);
    if (!jwk) return false;

    const key = await crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['verify'],
    );

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sigB64), signingInput);
  } catch {
    return false;
  }
}

// ── Middleware ───────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_STUDIO_MODE !== 'cloud') {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('boa-studio-session');
  if (!cookie?.value) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const authMode = process.env.NEXT_PUBLIC_STUDIO_AUTH;

  if (authMode === 'cognito') {
    const valid = await verifyCognitoJwt(cookie.value);
    if (!valid) {
      const res = NextResponse.redirect(new URL('/login', req.url));
      res.cookies.delete('boa-studio-session');
      return res;
    }
    return NextResponse.next();
  }

  // Token mode: cookie presence is checked here. Full secret validation
  // happens server-side in the dashboard layout where Node.js env vars
  // are available. Middleware runs as a CloudFront Function (Edge) and
  // cannot read server-side secrets like STUDIO_SESSION_SECRET.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

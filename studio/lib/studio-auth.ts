/**
 * Studio authentication mode.
 *
 * none   — local development, no auth required (STUDIO_MODE=local)
 * token  — shared access token, cloud mode default (STUDIO_AUTH=token)
 * cognito — per-user Cognito user pool (STUDIO_AUTH=cognito)
 */

export type StudioAuthMode = 'none' | 'token' | 'cognito';

export function getAuthMode(): StudioAuthMode {
  if (process.env.NEXT_PUBLIC_STUDIO_MODE !== 'cloud') return 'none';
  return process.env.NEXT_PUBLIC_STUDIO_AUTH === 'cognito' ? 'cognito' : 'token';
}

export function isCognito(): boolean {
  return getAuthMode() === 'cognito';
}

/** Derive the expected session cookie value from server-side secrets. */
export async function makeSessionCookieValue(): Promise<string> {
  const secret = process.env.STUDIO_SESSION_SECRET ?? '';
  const data = new TextEncoder().encode(`boa-studio-auth|${secret}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

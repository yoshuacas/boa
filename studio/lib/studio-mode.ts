/**
 * Studio mode helpers.
 *
 * STUDIO_MODE=local (default) — runs on the developer's machine,
 *   reads config from disk, no auth required, policies saved locally.
 *
 * STUDIO_MODE=cloud — deployed to AWS, reads config from SSM,
 *   auth active, policies deployed directly to Lambda.
 *
 * Env var accepts both STUDIO_MODE and the legacy NEXT_PUBLIC_STUDIO_MODE.
 */

export type StudioMode = 'local' | 'cloud';

export function getStudioMode(): StudioMode {
  const raw = process.env.STUDIO_MODE ?? process.env.NEXT_PUBLIC_STUDIO_MODE;
  return raw === 'cloud' ? 'cloud' : 'local';
}

export function isCloud(): boolean {
  return getStudioMode() === 'cloud';
}

export function isLocal(): boolean {
  return getStudioMode() === 'local';
}

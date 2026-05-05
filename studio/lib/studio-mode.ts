/**
 * Studio mode helpers.
 *
 * NEXT_PUBLIC_STUDIO_MODE=local (default) — runs on the developer's machine,
 *   reads config from disk, no auth required, policies saved locally.
 *
 * NEXT_PUBLIC_STUDIO_MODE=cloud — deployed to Amplify/cloud, reads config from
 *   SSM, auth middleware active, policies deployed directly to Lambda.
 */

export type StudioMode = 'local' | 'cloud';

export function getStudioMode(): StudioMode {
  const raw = process.env.NEXT_PUBLIC_STUDIO_MODE;
  return raw === 'cloud' ? 'cloud' : 'local';
}

export function isCloud(): boolean {
  return getStudioMode() === 'cloud';
}

export function isLocal(): boolean {
  return getStudioMode() === 'local';
}

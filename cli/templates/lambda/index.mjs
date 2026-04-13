import { createPgrest } from 'pgrest-lambda';
import { handler as uploadHandler } from './presigned-upload.mjs';

const pgrest = createPgrest();

export async function handler(rawEvent) {
  const event = pgrest.normalizeEvent(rawEvent);
  const path = event.path || '';

  // Presigned upload/download routes
  if (path === '/upload' || path === '/download') {
    return uploadHandler(event);
  }

  // Auth + REST engine (PostgREST-compatible API, GoTrue-compatible auth)
  return pgrest.handler(event);
}

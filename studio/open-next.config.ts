import { defineConfig } from 'open-next/config';

export default defineConfig({
  // Default: middleware compiles to a CloudFront Function (Edge).
  // Server-side secrets (STUDIO_SESSION_SECRET) are NOT available there —
  // token-mode session validation is handled in the dashboard layout instead.
  default: {},
});

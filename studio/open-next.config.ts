// open-next.config.ts
// Middleware compiles to a CloudFront Function (Edge) by default.
// Server-side secrets (STUDIO_SESSION_SECRET) are NOT available there —
// token-mode session validation is handled in the dashboard layout instead.
export default {
  default: {},
};

<!-- Studio architecture: Vite React SPA (src/) + Lambda API (lambda/) -->
# BOA Studio architecture notes

- **SPA**: `src/` — Vite + React Router v7, served from S3 via CloudFront
- **API**: `lambda/` — single Lambda handler serving all `/api/*` routes
- **Shared lib**: `lib/`, `types/`, `components/` — used by the SPA and Lambda
- Build: `npm run build` (SPA → dist/) and `npm run build:lambda` (Lambda → .lambda/index.js)
- The SPA never imports Node.js-only modules (AWS SDK, pg, fs)
- The Lambda imports from lib/ using `@/` path alias

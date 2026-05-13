# Task 04: Runtime Config and Response Headers

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Objective

Implement `writeRuntimeConfig(distDir, cfg)` and
`writeAmplifyHeaders(distDir, cfg)` plus
`validateHeaders(amplifyHeadersPath, defaults)` in
`cli/lib/frontend.mjs` -- the runtime configuration file and
security headers that ship with every frontend deploy.

## Target Tests

From `cli/__tests__/frontend-runtime-config.test.mjs`:
- All JSON shape tests (4 fields, optional storageUrl, auth
  provider variants)
- File location test
- Cache-Control metadata test

From `cli/__tests__/frontend-headers.test.mjs`:
- All default header tests (6 headers present, CSP interpolation)
- CSP merge tests (connectSrc, scriptSrc from config)
- Validation warning tests (frame-ancestors removal,
  unsafe-inline, no false warnings)
- Third-party script integrity check (SRI warnings)
- `suppressHeaderWarnings` config option

## Implementation

### cli/lib/frontend.mjs

**`writeRuntimeConfig(distDir, cfg)`:**

Parameters:
- `distDir` (string): build output directory.
- `cfg` (object): the BOA config (from `.boa/config.json`).

Behavior:
1. Build the runtime config object:
   ```javascript
   {
     apiUrl: cfg.apiUrl,
     anonKey: cfg.anonKey,
     ...(cfg.bucketName && {
       storageUrl: `https://${cfg.bucketName}.s3.${cfg.region}.amazonaws.com`
     }),
     authProvider: cfg.authProvider || 'better-auth'
   }
   ```
2. Write to `path.join(distDir, 'config.json')` with 2-space
   indent.
3. Return `{ path: '<written path>', cacheControl: 'no-cache, must-revalidate' }`.

The `cacheControl` value is metadata that the Amplify upload
step (Task 05/07) uses to set the `Cache-Control` header on
this specific file.

**`writeAmplifyHeaders(distDir, cfg)`:**

Parameters:
- `distDir` (string): build output directory.
- `cfg` (object): the BOA config.

Behavior:
1. Build the default CSP directive:
   - `default-src 'self'`
   - `connect-src 'self' <apiUrl> <extra from cfg.frontend.csp.connectSrc>`
   - `img-src 'self' data: <storageUrl> <extra from cfg.frontend.csp.imgSrc>`
   - `style-src 'self' 'unsafe-inline'`
   - `script-src 'self' <extra from cfg.frontend.csp.scriptSrc>`
   - `frame-ancestors 'none'`
   - `base-uri 'self'`
   - `form-action 'self'`
2. Build the YAML structure (use template literals, not a YAML
   library -- the structure is static):
   ```yaml
   customHeaders:
     - pattern: '**/*'
       headers:
         - key: 'Strict-Transport-Security'
           value: 'max-age=31536000; includeSubDomains'
         - key: 'X-Content-Type-Options'
           value: 'nosniff'
         - key: 'X-Frame-Options'
           value: 'DENY'
         - key: 'Referrer-Policy'
           value: 'strict-origin-when-cross-origin'
         - key: 'Permissions-Policy'
           value: 'camera=(), microphone=(), geolocation=()'
         - key: 'Content-Security-Policy'
           value: '<assembled CSP>'
   ```
3. Write to `path.join(distDir, '..', 'amplify-headers.yaml')`.
   The file lives alongside (not inside) the dist dir because
   Amplify reads it from the project root.
4. Return the written path.

**`validateHeaders(amplifyHeadersPath, defaults, distDir)`:**

Parameters:
- `amplifyHeadersPath` (string): path to an existing headers
  YAML (may not exist).
- `defaults` (object): the default header values for comparison.
- `distDir` (string): build output directory (used for SRI
  checking `index.html`).

Returns: `{ warnings: string[] }`.

Behavior:
1. If the file doesn't exist, return `{ warnings: [] }`.
2. Read the file and find the CSP value.
3. If CSP is present but `frame-ancestors` is absent, add
   warning: "Your amplify-headers.yaml overrides
   Content-Security-Policy but removes 'frame-ancestors'. The
   default value blocks clickjacking."
4. If CSP contains `'unsafe-inline'` in `script-src`, add
   warning: "CSP includes 'unsafe-inline' for script-src, which
   weakens XSS protection."
5. Check `index.html` in the dist dir for external `<script>`
   tags without `integrity` attributes. For each, add warning:
   "index.html loads scripts without integrity hashes:
   <url>. Without subresource integrity, a compromised CDN
   can serve modified code."
6. Return all warnings.

The `suppressHeaderWarnings` option is handled at the call site
(deploy-frontend command), not inside `validateHeaders`. The
function always returns the full list; the command checks
`cfg.frontend?.suppressHeaderWarnings` and skips printing if
true.

### Notes

- The storageUrl is computed from `cfg.bucketName` and
  `cfg.region`, matching the S3 regional endpoint pattern used
  throughout the CLI.
- CSP extra sources from `cfg.frontend.csp.*` are arrays of
  strings. If the arrays are empty or undefined, no extra
  sources are added.
- The YAML output uses single-quoted strings to avoid YAML
  escaping issues with semicolons and parentheses.

## Acceptance Criteria

- All `frontend-runtime-config.test.mjs` tests pass.
- All `frontend-headers.test.mjs` tests pass.
- Existing tests still pass.
- The generated YAML is valid (parseable by a YAML parser).
- The generated `config.json` is valid JSON.

## Conflict Criteria

- If all target tests already pass before any code changes are
  made, investigate whether the tests are true positives before
  marking the task complete.
- If the CSP merge logic produces duplicate entries (e.g.,
  `'self'` appearing twice), de-duplicate rather than
  escalating.

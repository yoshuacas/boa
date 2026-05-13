# Task 01: End-to-End Tests for `boa deploy frontend`

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Objective

Create unit test suites covering all behaviors of the frontend
deploy feature: secret scanning, source-map detection, runtime
config generation, response header defaults, CORS registration,
and the Amplify API wrapper. All tests should compile and fail
with clear messages indicating missing implementations.

## Test File Paths

- `cli/__tests__/frontend-secret-scan.test.mjs`
- `cli/__tests__/frontend-source-maps.test.mjs`
- `cli/__tests__/frontend-runtime-config.test.mjs`
- `cli/__tests__/frontend-headers.test.mjs`
- `cli/__tests__/frontend-cors-registration.test.mjs`
- `cli/__tests__/frontend-amplify.test.mjs`
- `cli/__tests__/frontend-detect.test.mjs`

Use Node.js built-in `node:test` and `node:assert/strict`. Follow
the existing test patterns in `cli/__tests__/` (e.g.,
`deploy-params.test.mjs`). Use `mkdtempSync` for temp dirs and
clean up in `afterEach`.

## Test Cases

### frontend-secret-scan.test.mjs

Tests for `scanBundleForSecrets(distDir, knownSecrets)` from
`cli/lib/frontend.mjs`.

**Positive detections (should find secrets):**
- Given a dist dir with a JS file containing the literal
  `serviceRoleKey` value from knownSecrets, when scanned, then
  returns a match with `{ file, line, pattern: 'serviceRoleKey',
  snippet }`.
- Given a dist dir with a JS file containing a JWT whose
  base64-decoded payload has `"role":"service_role"`, when
  scanned, then returns a match with pattern
  `'service_role_jwt'`.
- Given a dist dir with a file containing `AKIAIOSFODNN7EXAMPLE`
  (AWS access key pattern), when scanned, then returns a match
  with pattern `'aws_access_key'`.
- Given a dist dir with a file containing
  `aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"`
  (40 base64 chars near the keyword), when scanned, then returns
  a match with pattern `'aws_secret_key'`.
- Given a dist dir with a file containing
  `-----BEGIN RSA PRIVATE KEY-----`, when scanned, then returns
  a match with pattern `'private_key'`.
- Given a dist dir with a file containing
  `-----BEGIN EC PRIVATE KEY-----`, when scanned, then returns a
  match.
- Given a dist dir with a file containing
  `-----BEGIN OPENSSH PRIVATE KEY-----`, when scanned, then
  returns a match.
- Given a dist dir with a file containing
  `-----BEGIN PRIVATE KEY-----` (bare, no prefix), when scanned,
  then returns a match with pattern `'private_key'`.
- Given a dist dir with a file containing the `JWT_SECRET`
  value from knownSecrets, when scanned, then returns a match
  with pattern `'jwt_secret'`.
- Given a dist dir with a JS file containing a JWT whose
  payload has `"role":"admin"` (non-anon, non-authenticated),
  when scanned, then returns a match.

**Negative detections (should NOT find secrets):**
- Given a dist dir with a JS file containing the `anonKey`
  value (a JWT with `"role":"anon"`), when scanned, then returns
  an empty array.
- Given a dist dir with a JS file containing a JWT with
  `"role":"authenticated"`, when scanned, then returns an empty
  array.
- Given a dist dir with a JS file containing a JWT with no
  `role` field in the payload, when scanned, then returns an
  empty array.
- Given a dist dir with a string that looks like an AWS key but
  is only 15 chars after `AKIA` (too short), when scanned, then
  returns an empty array.
- Given a dist dir with a `.png` binary file (NUL bytes in first
  8KB), when scanned, then the file is skipped and returns an
  empty array.

**Multi-file and minified:**
- Given a dist dir with secrets spread across 3 different JS
  files, when scanned, then returns matches for all 3 files.
- Given a minified single-line JS file with a service role key
  embedded mid-line, when scanned, then detects it and reports
  the correct file.

### frontend-source-maps.test.mjs

Tests for `findSourceMaps(distDir)` from `cli/lib/frontend.mjs`.

- Given a dist dir containing `index.js.map` and
  `vendor.js.map`, when `findSourceMaps` is called, then returns
  both paths.
- Given a dist dir containing `.css.map` files, when called,
  then returns them (all `.map` files count).
- Given a dist dir with no `.map` files, when called, then
  returns an empty array.
- Given a dist dir with a nested `assets/chunk.js.map`, when
  called, then finds it (recursive search).
- Given a dist dir with a file named `sourcemap-config.json`
  (not a `.map` file), when called, then does not include it.

### frontend-runtime-config.test.mjs

Tests for `writeRuntimeConfig(distDir, cfg)` from
`cli/lib/frontend.mjs`.

**JSON shape:**
- Given a config with `apiUrl`, `anonKey`, `storageUrl`, and
  `authProvider: 'better-auth'`, when `writeRuntimeConfig` is
  called, then `config.json` is written to the distDir root
  with exactly those four fields.
- Given a config without `storageUrl` (no storage configured),
  when called, then `config.json` omits the `storageUrl` field.
- Given a config with `authProvider: 'cognito'`, when called,
  then the `authProvider` field reflects `'cognito'`.

**File location:**
- Given a distDir of `/tmp/build/dist`, when called, then the
  file is written to `/tmp/build/dist/config.json`.

**Cache-Control metadata:**
- When `writeRuntimeConfig` returns, then the returned metadata
  includes `cacheControl: 'no-cache, must-revalidate'` (for the
  Amplify upload to set the header).

### frontend-headers.test.mjs

Tests for `writeAmplifyHeaders(distDir, cfg)` and
`validateHeaders(amplifyHeadersPath, defaults)` from
`cli/lib/frontend.mjs`.

**Third-party script integrity check:**
- Given an `index.html` that loads a script tag from
  `https://cdn.example.com/widget.js` without an `integrity`
  attribute, when `validateHeaders` is called, then it returns a
  warning about subresource integrity.
- Given an `index.html` with a script tag that has both
  `integrity` and `crossorigin` attributes, when validated, then
  no SRI warning is returned.
- Given an `index.html` with inline scripts only (no external
  src), when validated, then no SRI warning is returned.

**suppressHeaderWarnings config:**
- Given `frontend.suppressHeaderWarnings: true` in the config,
  when `validateHeaders` returns warnings, then they are
  suppressed (not shown to the user).

**Default headers applied:**
- Given no existing `amplify-headers.yaml` and a config with
  `apiUrl` and `storageUrl`, when `writeAmplifyHeaders` is
  called, then a YAML file is written with all 6 default
  headers (HSTS, X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, CSP).
- Given a config with `apiUrl: 'https://api.example.dev'`, when
  written, then the CSP `connect-src` directive includes
  `https://api.example.dev`.
- Given a config with `storageUrl: 'https://bucket.s3.region.amazonaws.com'`,
  when written, then the CSP `img-src` includes the storage URL.

**CSP merge from config:**
- Given `frontend.csp.connectSrc: ['https://api.stripe.com']`
  in the config, when written, then CSP `connect-src` includes
  both the API URL and `https://api.stripe.com`.
- Given `frontend.csp.scriptSrc: ['https://cdn.example.com']`
  in the config, when written, then CSP `script-src` includes
  `'self'` and `https://cdn.example.com`.

**Validation warnings:**
- Given an existing headers YAML that removes `frame-ancestors`
  from CSP, when `validateHeaders` is called, then it returns a
  warning about clickjacking risk.
- Given an existing headers YAML that adds `'unsafe-inline'` to
  `script-src`, when `validateHeaders` is called, then it
  returns a warning about XSS risk.
- Given an existing headers YAML that only changes
  `connect-src`, when `validateHeaders` is called, then no
  warnings are returned.

### frontend-cors-registration.test.mjs

Tests for the CORS allow-list update behavior.

- Given an existing `allowedOrigins: []` in config and a new
  Amplify domain `https://main.abc123.amplifyapp.com`, when the
  origin is registered, then `allowedOrigins` becomes
  `['https://main.abc123.amplifyapp.com']`.
- Given `allowedOrigins: ['https://existing.example.com']` and
  a new domain, when registered, then both origins are present.
- Given `allowedOrigins` already containing the Amplify domain,
  when registered again, then the array is unchanged (de-dup).
- Given a `customDomain` of `https://app.example.dev` alongside
  the Amplify domain, when registered, then both are added to
  `allowedOrigins`.
- Given updated `allowedOrigins`, when persisted, then the
  config is written through `config.write()` and the JSON
  parameters file is correctly formatted (no comma-split
  regression).

### frontend-detect.test.mjs

Tests for `detectFramework(path)` and `buildFrontend(path,
framework)` from `cli/lib/frontend.mjs`.

**Framework detection:**
- Given a directory with `package.json` containing
  `devDependencies: { vite: "^5.0" }`, when `detectFramework`
  is called, then returns `'vite'`.
- Given a directory with `dependencies: { next: "^14.0" }`,
  when called, then returns `'next'`.
- Given a directory with `dependencies: { "react-scripts": "5" }`,
  when called, then returns `'cra'`.
- Given a directory with only `index.html` (no package.json),
  when called, then returns `'static'`.
- Given an empty directory, when called, then returns `null`.
- Given a directory with both `vite` and `next` in deps, when
  called, then returns `'vite'` (first match wins).

**Build output dir:**
- Given a `'vite'` framework, when `buildFrontend` completes,
  then the returned path ends in `/dist`.
- Given a `'next'` framework, when `buildFrontend` completes,
  then the returned path ends in `/out`.
- Given a `'cra'` framework, when `buildFrontend` completes,
  then the returned path ends in `/build`.
- Given a `'static'` framework, when `buildFrontend` is called,
  then the returned path is the input path itself (no build).

### frontend-amplify.test.mjs

Tests for `cli/lib/amplify.mjs`. Mock the AWS CLI subprocess
calls to verify correct command construction.

**createApp:**
- Given `{ name: 'myapp-web', region: 'us-east-2' }`, when
  `createApp` is called, then
  `aws amplify create-app --name myapp-web --region us-east-2`
  is invoked.
- Given a successful response, when parsed, then returns
  `{ appId, defaultDomain }`.

**createBranch:**
- Given `{ appId: 'abc123', branch: 'main' }`, when
  `createBranch` is called, then
  `aws amplify create-branch --app-id abc123 --branch-name main`
  is invoked.

**startDeployment (zip upload):**
- Given `{ appId, branch: 'main', sourceUrl }`, when
  `startDeployment` is called, then
  `aws amplify create-deployment --app-id ... --branch-name main`
  is called first to get an `uploadUrl` and `jobId`.
- Given the upload URL, when the zip is uploaded, then a PUT
  request is made to the presigned URL.
- After upload, `aws amplify start-deployment --app-id ... --branch-name main --job-id ...`
  is invoked.

**waitForDeployment:**
- Given a job that returns status `SUCCEED` on first poll, when
  `waitForDeployment` is called, then it returns
  `{ status: 'SUCCEED' }`.
- Given a job that returns `PENDING` then `SUCCEED`, when
  polled, then it polls until terminal state.
- Given a job that never completes within 120s, when polled,
  then it throws "Deployment timed out".

**getApp:**
- Given a valid `appId`, when `getApp` is called, then it
  returns the app object.
- Given a non-existent `appId`, when `getApp` is called, then
  it returns `null`.

**deleteApp:**
- Given `{ appId: 'abc123' }`, when `deleteApp` is called, then
  `aws amplify delete-app --app-id abc123` is invoked.

**attachDomain:**
- Given `{ appId, domain: 'app.example.dev', branch: 'main' }`,
  when `attachDomain` is called, then
  `aws amplify create-domain-association` is invoked with the
  domain and sub-domain mapping.

## Stub Modules

Create minimal stub source files so the test files can import
without errors. Each stub should export the expected API surface
but throw `"not implemented"` when called:

- `cli/lib/frontend.mjs` -- exports: `detectFramework`,
  `buildFrontend`, `scanBundleForSecrets`, `findSourceMaps`,
  `validateHeaders`, `writeRuntimeConfig`, `writeAmplifyHeaders`,
  `registerOrigin`
- `cli/lib/amplify.mjs` -- exports: `createApp`,
  `createBranch`, `startDeployment`, `waitForDeployment`,
  `getApp`, `deleteApp`, `attachDomain`

## Acceptance Criteria

- All test files are syntactically valid ESM.
- All tests compile (no import errors from stubs).
- All tests fail with clear assertion messages (e.g.,
  "expected scanBundleForSecrets to find service role key").
- No test panics or produces cryptic stack traces.
- Existing tests in `cli/__tests__/` still pass.

## Conflict Criteria

- If any test that should fail instead passes, first diagnose
  why by following the "Unexpected test results" steps in the
  implementer prompt: investigate the code path, verify the
  assertion targets the right behavior, and attempt to rewrite
  the test to isolate the intended path. Only escalate if you
  cannot construct a well-formed test that targets the desired
  behavior.

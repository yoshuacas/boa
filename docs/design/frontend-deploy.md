# Frontend Deploy: `boa deploy frontend`

**Status:** draft
**Author:** session pairing on 2026-05-13
**Depends on:** existing API Gateway + WAF default, the
`AllowedOrigins` CFN parameter, and the recently-fixed
comma-split bug in `cli/lib/deploy.mjs`.

## Overview

BOA today deploys a backend (database, auth, REST API, storage)
into the developer's AWS account. The frontend is the
developer's problem: build it, host it somewhere, wire it to
the backend, hope the right values land in the right places.

This feature closes that loop. `boa deploy frontend` builds a
SPA, ships it to AWS Amplify Hosting, registers the deployed
origin into the backend's CORS allow-list, applies a default
set of response headers, and refuses to deploy if the bundle
contains anything that looks like a leaked secret. The
frontend reads the backend URL and anon key from a runtime
`/config.json` rather than baked-in build vars, so backend
key rotations do not force a frontend rebuild.

The threat model this design takes seriously is leaked
*server-side* secrets, not "hidden" public values. Anything
the browser uses to call the backend is public by definition.
The real risks are:

- A `serviceRoleKey` accidentally bundled into `dist/`.
- Source maps published to a public origin, leaking business
  logic (and sometimes secrets) in comments.
- Wrong or missing CORS origin on the backend, leading to a
  developer pasting `*` into their config to "make it work."
- Default response headers missing, leaving the site open to
  clickjacking and content-injection.

The design addresses each directly. It does not pretend to
hide the API URL or anon key, because that would be theater.

## Current CX

Today, deploying a frontend that talks to a BOA backend
requires the developer to:

1. Build the SPA themselves.
2. Push to GitHub or zip-upload to Amplify manually.
3. Open the AWS console, create an Amplify app, point it at
   the repo, copy the build settings.
4. Manually add the deployed Amplify domain to
   `.boa/config.json` under `allowedOrigins`.
5. Run `boa deploy` to push the new allow-list to the
   backend (which until 2026-05-13 silently failed when the
   list had two or more origins — see `tasks/prs/completed/01-fix-allowed-origins-comma-split.md`).
6. Manually inject the backend URL and anon key into the
   bundle via `VITE_*` or `NEXT_PUBLIC_*` vars.
7. Re-deploy the frontend every time the backend rotates a
   key.

The `cyclewaze` deploy on 2026-05-13 took ~25 minutes to get
through this path. Most of that time was the comma-split bug;
the rest was tracking down the right origin to allow-list and
realizing the build had baked in a stale anon key.

## Proposed CX

### Command

```
boa deploy frontend [path]
```

`path` defaults to `./web` if it exists, else `./frontend`,
else `.` if there is an `index.html` at the project root.
Override with `--path` or with a `frontend.path` field in
`.boa/config.json`.

### First deploy (interactive)

```
$ boa deploy frontend ./web
  Frontend: ./web (detected: Vite)
  Backend:  cyclewaze (us-east-2)

  Building...                                          ✔ 8.3s
  Scanning bundle for secrets...                       ✔ clean
  Checking for source maps...                          ✔ none
  Validating headers...                                ✔ defaults applied
  Creating Amplify app cyclewaze-web...                ✔ 12.1s
  Deploying...                                         ✔ 41.2s
  Registering origin in backend allow-list...          ✔
  Writing /config.json (runtime config)...             ✔

  Frontend: https://main.d2tdp0t0w0ur3n.amplifyapp.com
  Backend:  https://api.cyclewaze.dev
```

### Subsequent deploys

```
$ boa deploy frontend
  Building...                                          ✔ 6.1s
  Scanning bundle for secrets...                       ✔ clean
  Deploying to cyclewaze-web...                        ✔ 22.4s

  Frontend: https://main.d2tdp0t0w0ur3n.amplifyapp.com
```

The backend allow-list and runtime config are not rewritten
when nothing has changed. Idempotent.

### Failure modes (blocking)

```
$ boa deploy frontend
  Building...                                          ✔ 7.2s
  Scanning bundle for secrets...                       ✗ FAIL

  Found service role key in dist/assets/index-a8c.js:
      eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2Vy...

  The service role key bypasses authorization and must
  never appear in a frontend bundle. Use the anon key
  for browser code, and keep the service role key in
  Lambda environment variables only.

  Aborting deploy. Nothing was uploaded.
```

```
$ boa deploy frontend
  Checking for source maps...                          ✗ FAIL

  Found 4 source map files in dist/:
      dist/assets/index-a8c.js.map
      dist/assets/vendor-c91.js.map
      dist/assets/auth-7d4.js.map
      dist/assets/styles-3f2.css.map

  Source maps reveal the original source code and can
  leak business logic, code comments, and occasionally
  secrets. Disable them in production builds:

      vite.config.js:  build: { sourcemap: false }
      next.config.js:  productionBrowserSourceMaps: false

  Override with --allow-source-maps if intentional
  (e.g., uploading to Sentry separately).

  Aborting deploy.
```

### Failure modes (warning, non-blocking)

```
$ boa deploy frontend
  Validating headers...                                ⚠ 1 warning

  Your amplify-headers.yaml overrides Content-Security-Policy
  but removes 'frame-ancestors'. The default value blocks
  clickjacking; without it your site can be embedded in
  iframes by any origin.

  Continuing. To suppress: pin the directive explicitly,
  or set frontend.suppressHeaderWarnings: true in
  .boa/config.json.
```

```
  Validating third-party scripts...                    ⚠ 2 warnings

  index.html loads scripts without integrity hashes:
      https://www.googletagmanager.com/gtag/js
      https://cdn.example.com/widget.js

  Without subresource integrity, a compromised CDN can
  serve modified code. Add integrity= and crossorigin=
  attributes if these scripts have stable URLs.
```

### Bundle scan rules

The blocking secret scan looks for, in `dist/` (or whatever
the framework's output dir is):

- The literal `serviceRoleKey` value from `.boa/config.json`,
  if present.
- The literal `JWT_SECRET` value (if surfaced anywhere
  client-readable).
- AWS access-key-id pattern: `AKIA[0-9A-Z]{16}`.
- AWS secret-access-key shape: 40 base64 characters preceded
  by `aws_secret_access_key` or `secretAccessKey` within
  20 characters.
- PEM private key headers:
  `-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----`.
- A JWT whose payload (base64-decoded) has
  `"role":"service_role"` or any role other than `anon`,
  `authenticated`, or absent.

The scan reads every file under the build output directory
that is text-shaped (heuristic: UTF-8 decode succeeds and
no NUL bytes in the first 8KB). Binary assets are skipped.

The scan is cheap (a few hundred ms on typical bundles) and
runs on every deploy — there is no opt-out short of
`--skip-secret-scan`, which prints a prominent warning and
records the override in the deploy log.

### Source-map check

If any `*.map` file exists in the build output, fail unless:

- `--allow-source-maps` is passed, or
- `frontend.allowSourceMaps: true` is set in
  `.boa/config.json`.

### Default response headers

Applied via Amplify custom headers, written to
`amplify-headers.yaml` at deploy time (not committed by the
developer — BOA owns the file and rewrites it):

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
        value: "default-src 'self'; connect-src 'self' https://<api-host>; img-src 'self' data: https://<storage-host>; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
```

`<api-host>` is the deployed API Gateway domain or custom
domain. `<storage-host>` is the S3 bucket's regional
endpoint. Both are interpolated at deploy time.

CSP is the only header where developers reasonably need to
extend the default (e.g., to add a payments provider). The
mechanism: a `frontend.csp.connectSrc` (and `imgSrc`,
`scriptSrc`, etc.) array in `.boa/config.json`, merged into
the default at deploy. Anything outside that mechanism that
overrides CSP is treated as a deliberate opt-out and
generates the warning shown above.

### Runtime configuration

The frontend is built with no backend-specific build vars.
Instead, BOA writes a `config.json` to the deploy root:

```json
{
  "apiUrl": "https://api.cyclewaze.dev",
  "anonKey": "eyJhbGciOiJIUzI1NiI...",
  "storageUrl": "https://cyclewaze-storage.s3.us-east-2.amazonaws.com",
  "authProvider": "better-auth"
}
```

The frontend fetches `/config.json` on first load. The BOA
client library (`boa-client-library`) consumes this directly:

```js
import { createClient } from '@boa/client';
const config = await fetch('/config.json').then(r => r.json());
const boa = createClient(config);
```

`config.json` is served with `Cache-Control: no-cache,
must-revalidate` so a backend rotation propagates on the
next page load without a frontend rebuild.

This is the same pattern the Supabase hosted dashboard uses:
the dashboard binary is one immutable bundle, and per-user
project values are loaded at runtime.

### CORS allow-list registration

After Amplify creates the app, BOA reads the deployed
domain (e.g., `https://main.d2tdp0t0w0ur3n.amplifyapp.com`),
appends it to `cfg.allowedOrigins` in `.boa/config.json`,
de-duplicates, and runs the backend update path so the new
origin lands in the API Gateway and S3 CORS rules.

If a custom domain is configured (`frontend.customDomain`),
that is the canonical origin; the Amplify-generated domain
is added too because Amplify keeps it active even after
custom domain attaches.

### Custom domains (optional)

```
boa deploy frontend --domain app.cyclewaze.dev
```

BOA creates the Amplify domain association and the ACM
certificate. DNS validation records are printed for the
developer to add to their registrar. If the domain is in
Route53 in the same account, BOA writes the records itself
(behind a confirmation prompt — Route53 changes are
billable and visible).

## Technical Design

### New CFN resources (in `cli/templates/backend.yaml`)

None. The Amplify app is created via direct API calls, not
CloudFormation, for two reasons:

1. The Amplify app is logically separate from the backend
   stack — its lifecycle (frontend rebuilds, branch deploys)
   moves at a different cadence than the backend.
2. CFN updates to `AWS::Amplify::App` resources are
   surprisingly destructive when build settings change:
   they sometimes recreate the app and lose deploy history.
   Direct API calls keep BOA in control of the change set.

The Amplify app metadata is recorded in `.boa/config.json`
under `frontend.amplifyAppId`, `frontend.amplifyDomain`,
`frontend.deployedAt`. Teardown reads from there.

### `.boa/config.json` extensions

```json
{
  "stackName": "cyclewaze",
  "region": "us-east-2",
  "allowedOrigins": ["https://main.d2tdp0t0w0ur3n.amplifyapp.com"],
  "frontend": {
    "path": "./web",
    "framework": "vite",
    "amplifyAppId": "d2tdp0t0w0ur3n",
    "amplifyDomain": "https://main.d2tdp0t0w0ur3n.amplifyapp.com",
    "customDomain": null,
    "csp": {
      "connectSrc": ["https://api.stripe.com"],
      "scriptSrc": []
    },
    "allowSourceMaps": false,
    "deployedAt": "2026-05-13T18:42:11Z"
  }
}
```

All `frontend.*` fields are optional; their absence means
the frontend has not been deployed yet. `boa status` reads
this block to display the frontend URL alongside the
backend.

### New module: `cli/lib/frontend.mjs`

Exports:

- `detectFramework(path)` — returns `'vite' | 'next' | 'cra' | 'static' | null`. Inspects `package.json` and known config files. Returns `null` for unrecognized layouts; the developer gets a clear error.
- `buildFrontend(path, framework)` — runs the framework's build and returns the absolute path to the output dir.
- `scanBundleForSecrets(distDir, knownSecrets)` — returns an array of `{ file, line, pattern, snippet }` matches. Empty array means clean.
- `findSourceMaps(distDir)` — returns an array of map file paths.
- `validateHeaders(amplifyHeadersPath, defaults)` — returns `{ warnings: [...], merged: {...} }`.
- `writeRuntimeConfig(distDir, cfg)` — writes `config.json` to the build output.
- `writeAmplifyHeaders(distDir, cfg)` — writes the `customHeaders` YAML alongside the build output (Amplify reads it from there).

### New module: `cli/lib/amplify.mjs`

Wraps the AWS Amplify API calls (no SDK, plain `aws amplify`
CLI for consistency with the rest of `cli/lib/aws.mjs`):

- `createApp({ name, region })` — `aws amplify create-app`.
- `createBranch({ appId, branch })` — `main` by default.
- `startDeployment({ appId, branch, sourceUrl })` — uses
  the manual-deploy zip-upload path, not git connection. The
  developer's repo is not connected to AWS; the developer
  runs `boa deploy frontend` and BOA zips + uploads the
  build artifact directly via `aws amplify create-deployment`
  + `aws amplify start-deployment`.
- `attachDomain({ appId, domain, branch })`.
- `deleteApp({ appId })` — used by `boa teardown`.

The zip-upload path keeps BOA agnostic about how the
frontend lives in version control. It also avoids needing
GitHub/GitLab tokens.

### New command: `cli/commands/deploy-frontend.mjs`

Wired into `cli/commands/deploy.mjs` as a subcommand router:

```
boa deploy             → existing backend deploy
boa deploy backend     → alias for the above
boa deploy frontend    → this design
boa deploy all         → backend then frontend
```

Backwards-compatible: bare `boa deploy` keeps its current
behavior.

### Teardown integration

`boa teardown` already exists for the backend. It must:

- Detect `frontend.amplifyAppId` and `frontend.customDomain`.
- Prompt to delete the Amplify app, separately from the
  backend warning box.
- Refuse to delete the custom domain's ACM certificate
  unless `--force` is passed (the cert can be reused).

This stays consistent with the "Retain on stateful resources"
philosophy in [`safe-teardown`](safe-teardown.md).

### Skill updates

`plugin/skills/boa/SKILL.md` and `cli/skill/SKILL.md` get a
new "Deploying a frontend" section. The flow described to
agents is:

1. After `boa deploy` succeeds, ask the developer if they
   have a frontend to deploy.
2. If yes, confirm the path (default `./web`).
3. Run `boa deploy frontend`.
4. If the secret scan fails, show the file/line, suggest
   the fix, do not retry without developer confirmation.

The skill must not auto-add `--skip-secret-scan` or
`--allow-source-maps`. These are deliberate opt-outs that
should always come from the human.

`plugin/docs/PITFALLS.md` gets entries for:

- "Service role key in frontend bundle" (the scan catches
  this; document why it matters).
- "Source maps in production" (likewise).
- "CSP `unsafe-inline` for scripts" (warn if developer
  weakens the default).

## Code Architecture / File Changes

New files:

- `cli/commands/deploy-frontend.mjs` — the subcommand entry.
- `cli/lib/frontend.mjs` — build, scan, validate, write
  runtime config.
- `cli/lib/amplify.mjs` — Amplify API wrapper.
- `cli/__tests__/frontend-secret-scan.test.mjs` — every
  pattern, positive and negative.
- `cli/__tests__/frontend-source-maps.test.mjs` — detection
  + opt-out flag + config flag.
- `cli/__tests__/frontend-runtime-config.test.mjs` — verify
  config.json shape.
- `cli/__tests__/frontend-headers.test.mjs` — verify
  defaults applied, override warnings, CSP merge.
- `cli/__tests__/frontend-cors-registration.test.mjs` —
  verify allowedOrigins update + de-dup.

Modified:

- `cli/commands/deploy.mjs` — subcommand router.
- `cli/commands/teardown.mjs` — include Amplify app in the
  teardown plan.
- `cli/commands/status.mjs` — display frontend URL.
- `cli/lib/config.mjs` — schema additions for
  `frontend.*`.
- `plugin/skills/boa/SKILL.md`, `cli/skill/SKILL.md` —
  document the new flow.
- `plugin/docs/PITFALLS.md` — three new entries.
- `cli/templates/backend.yaml` — no changes needed (the
  CORS allow-list parameter already accepts the Amplify
  domain).
- `docs/GLOSSARY.md` — add **runtime config**, **bundle
  scan**, **frontend deploy** terms.

## Testing Strategy

### Unit (Node `test` runner)

- `frontend-secret-scan`: each detector pattern positive and
  negative; binary-file skip; minified-code matching;
  multi-file matches.
- `frontend-source-maps`: detect `.map` files; respect
  `--allow-source-maps` and `frontend.allowSourceMaps`.
- `frontend-runtime-config`: verify generated JSON shape
  for each auth provider; verify file is written to the
  framework-specific output dir; verify `Cache-Control`
  metadata for the upload.
- `frontend-headers`: defaults applied; CSP merge from
  `.boa/config.json`; warn on
  `frame-ancestors` removal; warn on `unsafe-inline` in
  `script-src`.
- `frontend-cors-registration`: append + de-dupe;
  preserves existing entries; round-trips through the
  CFN parameter file (the bug we just fixed).
- `amplify`: mock the AWS CLI, verify the right commands
  are invoked in the right order.

### Integration

A new live deploy fixture: `cyclewaze` is a candidate (it is
the bug reporter and already has a backend stack). The test
plan:

1. `boa deploy frontend` from a Vite SPA with no secrets.
   Expect success and a working `https://...amplifyapp.com`.
2. Inject a service-role-key-shaped string into a comment
   in `src/main.js`. Expect the deploy to fail at the scan.
3. Add `build: { sourcemap: true }` to `vite.config.js`.
   Expect deploy to fail.
4. Pass `--allow-source-maps`. Expect success.
5. Verify CORS preflight from the deployed origin returns
   the origin header.
6. Verify `/config.json` returns the right shape and is
   served with `Cache-Control: no-cache`.
7. Rotate the anon key with `boa rotate-keys`; verify the
   next page load picks up the new key without a frontend
   rebuild.

### Manual verification matrix (in `docs/access-policy-verification-matrix.md`-style format)

| Scenario | Expected | Verify |
|----------|----------|--------|
| Vite SPA, no secrets | 200 OK from deployed origin | curl + browser load |
| Service role key in source | Deploy aborts with file:line | exit code 1, no Amplify app created |
| Service role key in dependency | Deploy aborts | exit code 1 |
| Source maps present, no flag | Deploy aborts | exit code 1 |
| Source maps + `--allow-source-maps` | Deploy succeeds | 200 OK |
| Custom CSP `connectSrc` | Header present in response | curl `-I` |
| Removes `frame-ancestors` | Warning printed, deploy succeeds | exit code 0, stderr has warning |
| Subsequent deploy, no changes | Backend allow-list unchanged | diff `.boa/config.json` |
| Custom domain with Route53 records | Records written after confirm | `aws route53 list-resource-record-sets` |
| Teardown | Amplify app deleted, ACM cert retained | `aws amplify list-apps` |

## Implementation Order

The work decomposes into seven self-contained tasks. Each is
small enough for a single rring `work` iteration.

1. **E2E test scaffold** (`tasks/frontend-deploy/01-e2e-tests.md`). All test files compile and fail with clear "not implemented" messages.
2. **Framework detection + build** — `detectFramework`, `buildFrontend`. No deploy yet; verify the build artifact lands where expected.
3. **Bundle scan** — secret detectors + source-map detector. The most security-sensitive piece; gets its own task to keep the diff small and reviewable.
4. **Runtime config + headers** — `writeRuntimeConfig`, `writeAmplifyHeaders`, CSP merge.
5. **Amplify wrapper** — `cli/lib/amplify.mjs`. Mocked first, then a live smoke test against a throwaway app.
6. **CORS allow-list registration** — append to `cfg.allowedOrigins`, de-dup, run the existing backend update path. Reuses the JSON-tempfile fix from `01-fix-allowed-origins-comma-split`.
7. **Subcommand wiring + teardown + status + skill docs** — bundle the user-facing surface area that should land together.

Tasks 2–6 are independent and can be parallelized in
separate rring loops if desired.

## Open Questions

1. **Build environment.** Should BOA run the build in a
   throwaway container (Docker) for reproducibility, or
   trust the developer's local Node? The Supabase model is
   "trust local"; that is simpler and what we propose.
   Containerized builds can be a later enhancement.
2. **Atomic deploy.** Amplify deployments are atomic at the
   branch level, but the CORS registration happens after.
   If the CORS update fails after a successful frontend
   deploy, the site is live but blocked from talking to the
   backend. Proposal: register the origin *before* the
   frontend deploy lands (idempotent on the backend side),
   so by the time the deploy goes live, CORS is already
   open.
3. **Anon key in `config.json`.** The anon key is public by
   design, but exposing it via a fetch-able URL slightly
   widens the surface (a misconfigured CDN could cache it
   incorrectly across origins). Mitigation: `Cache-Control:
   no-store` if we want maximum strictness, but that costs
   a round-trip on every load. We propose `no-cache,
   must-revalidate` (revalidates with `If-Modified-Since`
   but uses cache when unchanged). Open to `no-store` if
   the team feels strongly.
4. **Source-map upload to Sentry/Datadog.** If we forbid
   source maps in `dist/` but the developer wants them
   uploaded to an error tracker, the workflow is:
   build with source maps → upload to Sentry → delete from
   `dist/` → run BOA. We should document this. Out of scope
   for v1; covered by the `--allow-source-maps` escape
   hatch in the meantime.
5. **Multi-environment deploys.** Today this design assumes
   one Amplify branch per BOA project. A `dev` /
   `staging` / `prod` split needs additional `--branch`
   wiring and per-branch `.boa/config.<env>.json`. Defer
   to a follow-up; the v1 design handles single-branch
   well.

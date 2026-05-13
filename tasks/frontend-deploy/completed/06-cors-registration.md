# Task 06: CORS Allow-List Registration

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Objective

Implement the CORS origin registration that appends the
deployed Amplify domain to `.boa/config.json`'s `allowedOrigins`
array, de-duplicates, and persists it through the existing
backend update path.

## Target Tests

From `cli/__tests__/frontend-cors-registration.test.mjs`:
- Append to empty array
- Append to existing array (preserves existing entries)
- De-duplicate when already present
- Custom domain added alongside Amplify domain
- Config written correctly (no comma-split regression)

## Implementation

### cli/lib/frontend.mjs (or a new helper within it)

Add a function `registerOrigin(cfg, origins)`:

Parameters:
- `cfg` (object): the current BOA config (mutable reference).
- `origins` (string[]): one or more origin URLs to register.

Behavior:
1. Ensure `cfg.allowedOrigins` is an array (default `[]`).
2. For each origin in `origins`:
   - Normalize: strip trailing slash if present.
   - Append to `cfg.allowedOrigins` if not already present.
3. De-duplicate the array (use a Set).
4. Write the updated config via `config.write(cfg, projectDir)`.
5. Return `{ added: [...], existing: [...] }` indicating which
   origins were new vs already present.

### Integration with the deploy flow

The deploy-frontend command (Task 07) calls `registerOrigin`
after the Amplify deployment succeeds, passing:
- The Amplify-generated domain:
  `https://main.<appId>.amplifyapp.com`
- The custom domain if configured:
  `https://<frontend.customDomain>`

### Interaction with backend deploy

After updating `allowedOrigins` in the config, the command must
also update the live backend. This uses the existing
`deployStack` path from `cli/lib/deploy.mjs` which reads
`allowedOrigins` from config and passes it as the
`AllowedOrigins` CFN parameter.

The design specifies that the origin should be registered
*before* the frontend deploy goes live (so CORS is open by the
time the site is accessible). The implementation order in
Task 07 will be:
1. Build and scan.
2. Register origin in config + update backend CORS.
3. Deploy to Amplify.

This task only implements the `registerOrigin` function and its
unit tests. The orchestration lives in Task 07.

### Comma-split safety

The recently-fixed comma-split bug (`tasks/prs/completed/01-fix-allowed-origins-comma-split.md`)
means `allowedOrigins` is now written as a JSON temp file for
CFN parameters rather than passed as a comma-separated CLI arg.
This task does NOT need to re-implement that fix -- it already
exists in `cli/lib/deploy.mjs`. Just ensure the config is
written correctly and the existing `writeParamsFile` function
handles the rest.

Assumption: `writeParamsFile` from `cli/lib/deploy.mjs` is
called during the backend update path and correctly serializes
arrays. If this assumption does not hold, investigate and adapt.

## Acceptance Criteria

- All `frontend-cors-registration.test.mjs` tests pass.
- Existing tests still pass (especially `deploy-params.test.mjs`).
- The `registerOrigin` function is exported from
  `cli/lib/frontend.mjs`.
- Origins are always stored with `https://` prefix, no trailing
  slash.

## Conflict Criteria

- If all target tests already pass before any code changes are
  made, investigate whether the tests are true positives before
  marking the task complete.
- If `config.write` has a different signature than expected
  (check `cli/lib/config.mjs`), adapt the call site rather than
  escalating.
- If `writeParamsFile` does not handle the `allowedOrigins`
  array as expected, investigate the current implementation and
  adapt rather than escalating.

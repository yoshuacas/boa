# Task 03: Bundle Secret Scan and Source-Map Detection

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Objective

Implement `scanBundleForSecrets(distDir, knownSecrets)` and
`findSourceMaps(distDir)` in `cli/lib/frontend.mjs` -- the
security guardrails that block deploys containing leaked secrets
or source maps.

## Target Tests

From `cli/__tests__/frontend-secret-scan.test.mjs`:
- All positive detection tests (serviceRoleKey, service_role JWT,
  AWS access key, AWS secret key, PEM private keys, JWT_SECRET,
  non-anon JWT roles)
- All negative detection tests (anonKey, authenticated JWT,
  no-role JWT, short key pattern, binary file skip)
- Multi-file and minified detection tests

From `cli/__tests__/frontend-source-maps.test.mjs`:
- All source-map detection tests (find .map files, recursive,
  no false positives)

## Implementation

### cli/lib/frontend.mjs

**`scanBundleForSecrets(distDir, knownSecrets)`:**

Parameters:
- `distDir` (string): absolute path to the build output.
- `knownSecrets` (object): `{ serviceRoleKey?, jwtSecret? }` --
  literal values from `.boa/config.json` to match against.

Returns: `Array<{ file, line, pattern, snippet }>`. Empty array
means clean.

Algorithm:
1. Recursively list all files under `distDir`.
2. For each file, read the first 8KB. If it contains a NUL byte
   (`\x00`), skip it (binary heuristic).
3. For text files, read the full content and test each detector.

Detectors (order matters for reporting, not short-circuit):

1. **`serviceRoleKey`** -- if `knownSecrets.serviceRoleKey` is
   set, check if the literal string appears anywhere in the
   file. Pattern name: `'serviceRoleKey'`.

2. **`jwt_secret`** -- if `knownSecrets.jwtSecret` is set,
   check for the literal value. Pattern name: `'jwt_secret'`.

3. **`aws_access_key`** -- regex: `/AKIA[0-9A-Z]{16}/`. Pattern
   name: `'aws_access_key'`.

4. **`aws_secret_key`** -- regex:
   `/(aws_secret_access_key|secretAccessKey).{0,20}[A-Za-z0-9/+=]{40}/`.
   Pattern name: `'aws_secret_key'`.

5. **`private_key`** -- regex:
   `/-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/`. Pattern
   name: `'private_key'`.

6. **`service_role_jwt`** -- find JWT-shaped strings
   (`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`),
   base64url-decode the second segment (payload), parse as
   JSON, check the `role` field. Flag if role is anything other
   than `'anon'`, `'authenticated'`, or absent. Pattern name:
   `'service_role_jwt'`.

For each match, record:
- `file`: relative path from distDir.
- `line`: 1-based line number (or 1 for single-line minified).
- `pattern`: the detector name.
- `snippet`: up to 60 chars of context around the match.

**`findSourceMaps(distDir)`:**

Recursively find all files ending in `.map` under distDir.
Return an array of relative paths (strings). Simple glob or
recursive readdir with filter.

### Error handling

- If `distDir` does not exist, throw with a clear message:
  "Build output directory not found: <path>".
- If a file cannot be read (permissions), skip it with a
  console warning.

## Acceptance Criteria

- All `frontend-secret-scan.test.mjs` tests pass.
- All `frontend-source-maps.test.mjs` tests pass.
- Existing tests still pass.
- The scan handles large minified files without crashing
  (no regex catastrophic backtracking).

## Conflict Criteria

- If all target tests already pass before any code changes are
  made, investigate whether the tests are true positives before
  marking the task complete.
- If the JWT base64url decoding encounters padded vs unpadded
  variants, handle both rather than escalating.
- If the regex patterns match false positives in the test
  fixtures, tighten the pattern and update the corresponding
  test rather than escalating.

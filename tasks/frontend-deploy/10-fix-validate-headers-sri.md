# Task 10: Wire SRI check to index.html so the warning fires

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Context

`cli/lib/frontend.mjs:198–238` `validateHeaders()` has two
branches:
- A YAML branch that inspects `amplify-headers.yaml` for CSP
  weakening (`frame-ancestors` removal, `unsafe-inline` in
  `script-src`).
- An HTML branch that scans `index.html` for `<script>` tags
  loaded from third-party origins without `integrity=`
  attributes (Subresource Integrity).

The deploy command (`cli/commands/deploy-frontend.mjs:124`)
only ever calls `validateHeaders(headersPath, cfg)` where
`headersPath` is the path to `amplify-headers.yaml`. The
HTML branch is unreachable in practice. The SRI warning the
design promises will never fire on a real deploy.

## Objective

Refactor `validateHeaders` so both checks run on every deploy.
The function should receive the *build output directory* and
inspect both `amplify-headers.yaml` (if present) and
`index.html` (if present) inside it, returning the merged
warning list.

## Target Tests

Add to `cli/__tests__/frontend-headers.test.mjs`:

1. **Both checks run when both files exist.** Setup: a tmp
   dist dir with both `amplify-headers.yaml` (containing a CSP
   without `frame-ancestors`) and `index.html` (containing a
   `<script src="https://cdn.example.com/widget.js">` without
   `integrity`). Call `validateHeaders(distDir, cfg)`. Assert
   the returned warnings array contains both:
   - The clickjacking warning (from the YAML branch).
   - The SRI warning (from the HTML branch).

2. **Inline scripts and same-origin scripts don't warn.**
   Setup: `index.html` containing only `<script>...</script>`
   inline tags and `<script src="/local.js">` (relative URL).
   Assert no SRI warnings.

3. **Scripts with integrity attribute don't warn.** Setup:
   `<script src="https://cdn.example.com/x.js" integrity="sha384-..." crossorigin="anonymous">`.
   Assert no SRI warnings.

4. **`suppressHeaderWarnings` suppresses both checks.** Setup:
   both files present with violations,
   `cfg.frontend.suppressHeaderWarnings = true`. Assert empty
   warnings array.

5. **Missing files produce no warnings.** Setup: empty dist
   dir. Assert empty warnings array. (Don't throw.)

## Implementation

### `cli/lib/frontend.mjs`

Change the signature:

```js
export function validateHeaders(distDir, cfg) {
  if (cfg?.frontend?.suppressHeaderWarnings) return [];

  const warnings = [];

  const yamlPath = join(distDir, 'amplify-headers.yaml');
  if (existsSync(yamlPath)) {
    const content = readFileSync(yamlPath, 'utf8');
    const cspMatch = content.match(/Content-Security-Policy[\s\S]*?value:\s*["']?(.*?)["']?\s*$/m);
    if (cspMatch) {
      const cspValue = cspMatch[1];
      if (!cspValue.includes('frame-ancestors')) {
        warnings.push(
          "Your amplify-headers.yaml overrides Content-Security-Policy but removes 'frame-ancestors'. The default value blocks clickjacking."
        );
      }
      if (/script-src[^;]*'unsafe-inline'/.test(cspValue)) {
        warnings.push(
          "CSP includes 'unsafe-inline' for script-src, which weakens XSS protection."
        );
      }
    }
  }

  const htmlPath = join(distDir, 'index.html');
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, 'utf8');
    const scriptRe = /<script\s[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = scriptRe.exec(html)) !== null) {
      const url = match[1];
      if (!url.startsWith('http')) continue;
      const tag = match[0];
      if (!tag.includes('integrity')) {
        warnings.push(
          `index.html loads scripts without integrity hashes: ${url}. Without subresource integrity, a compromised CDN can serve modified code.`
        );
      }
    }
  }

  return warnings;
}
```

### `cli/commands/deploy-frontend.mjs`

Update the call site (currently around line 124):

```js
// Before:
//   const headerWarnings = validateHeaders(headersPath, cfg);
// After:
const headerWarnings = validateHeaders(distDir, cfg);
```

`headersPath` is no longer needed at the call site. The
`writeAmplifyHeaders` return value is still useful for
logging/debugging; leave it as-is.

### Migrate existing tests

Existing `frontend-headers.test.mjs` tests that pass a
`headersPath` directly need to be updated to pass a `distDir`
that contains an `amplify-headers.yaml` file. Same coverage,
different setup shape.

## Acceptance Criteria

- All five new tests pass.
- All existing `frontend-headers.test.mjs` tests pass after
  the signature migration.
- No regression to `deploy-frontend-command.test.mjs` (the
  command's call site has been updated).
- `validateHeaders(distDir, cfg)` is the only exported
  signature; no overload that takes a file path directly.

## Conflict Criteria

- If the existing `frontend-headers.test.mjs` test expectations
  depend on the old file-path signature in ways that can't be
  cleanly migrated, document the conflict and escalate. Do not
  introduce a backwards-compatible polymorphic signature — pick
  one shape and update the callers.

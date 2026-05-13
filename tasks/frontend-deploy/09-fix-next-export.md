# Task 09: Fix Next.js build command (next export removed in v14)

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Context

`cli/lib/frontend.mjs:22` runs `npx next build && npx next export`
for Next.js projects. The `next export` subcommand was removed
in Next.js 14 (released October 2023) and replaced with the
`output: 'export'` config in `next.config.js`. Every Next.js
project on a current version of Next will fail during the
build step with:

```
error - Invalid project directory provided, no such directory: ...
Unknown command: 'export'
```

This blocks any Next.js user from using `boa deploy frontend`
at all.

## Objective

Replace the broken `next export` invocation with the modern
static-export workflow. For projects that already have
`output: 'export'` in `next.config.{js,mjs,ts}`, just run
`npx next build` and read from `out/`. For projects that
don't, the build will produce `.next/` instead of `out/`,
which is not deployable to Amplify Hosting (a static host) —
fail with a clear error pointing the developer at the fix.

## Target Tests

Add to `cli/__tests__/frontend-detect.test.mjs` (or rename to
`frontend-build.test.mjs` if more appropriate):

1. **Next.js project with `output: 'export'` builds successfully.**
   Setup: a fixture with `package.json` containing `"next":
   "^15.0.0"` and a `next.config.js` containing
   `module.exports = { output: 'export' }`. Stub `npx` to
   create an `out/` directory. Run `buildFrontend(dir, 'next')`.
   Assert it returns the path to `out/` and the recorded `npx`
   calls contain `next build` but not `next export`.

2. **Next.js project without `output: 'export'` fails with a
   clear error.** Setup: a fixture with `package.json` next
   dependency and a `next.config.js` *without* `output: 'export'`
   (and no static-export config detectable in `.mjs` or `.ts`
   variants). `buildFrontend(dir, 'next')` should throw an
   error whose message names the missing config and points the
   developer at the fix. Suggested message:
   ```
   Next.js project does not have static export enabled. Add
   `output: 'export'` to your next.config.js so the build
   produces `out/` instead of `.next/`. Amplify Hosting only
   serves static files.
   ```

3. **Pre-build detection works for `.mjs` and `.ts` next
   configs.** Cover `next.config.mjs` and `next.config.ts`
   variants too.

## Implementation

### `cli/lib/frontend.mjs`

Replace the current `BUILD_CONFIG` entry for `next` with a
function-style entry, since the build for Next isn't a
single command — it's a build plus a precondition check.

```js
const BUILD_CONFIG = {
  vite: { cmd: 'npx vite build', outDir: 'dist' },
  cra: { cmd: 'npx react-scripts build', outDir: 'build' },
  // next handled separately because of the static-export check
};

function nextHasStaticExport(dir) {
  const candidates = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
  for (const name of candidates) {
    const p = join(dir, name);
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      // Match output: 'export' or output: "export"
      if (/output\s*:\s*['"]export['"]/.test(content)) return true;
    }
  }
  return false;
}

export function buildFrontend(dir, framework) {
  const resolved = resolve(dir);
  if (framework === 'static') return resolved;

  if (framework === 'next') {
    if (!nextHasStaticExport(resolved)) {
      throw new Error(
        "Next.js project does not have static export enabled. " +
        "Add `output: 'export'` to your next.config.js so the " +
        "build produces `out/` instead of `.next/`. Amplify " +
        "Hosting only serves static files."
      );
    }
    try {
      _internal.exec('npx next build', { cwd: resolved, stdio: 'pipe' });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : err.message;
      throw new Error(`Build failed: ${stderr}`);
    }
    return join(resolved, 'out');
  }

  const config = BUILD_CONFIG[framework];
  if (!config) throw new Error(`Unknown framework: ${framework}`);
  // ... rest unchanged
}
```

### Skill / pitfalls

Add a one-liner to `plugin/docs/PITFALLS.md` and
`cli/skill/docs/PITFALLS.md` under the **Frontend** section:

> **Next.js requires `output: 'export'`.** BOA serves the
> frontend from Amplify Hosting (static), so Next.js projects
> must opt into static export. Add `output: 'export'` to
> `next.config.js`. Server-rendered pages, `getServerSideProps`,
> and API routes are not supported in this mode — use BOA
> Lambda functions instead.

## Acceptance Criteria

- All three new tests pass.
- Existing `frontend-detect.test.mjs` and `frontend-secret-scan.test.mjs` tests still pass.
- The PITFALLS entry lands in both copies of the file (CLI skill
  and plugin skill — they're kept in sync).

## Conflict Criteria

- If the test fixture can't easily mock `existsSync`, write
  real fixture files in a temp dir and pass the temp dir as
  `dir` rather than escalating.
- If a developer has a TypeScript `next.config.ts` with the
  config inside a function or imported from another module,
  the regex won't catch it. That's an acceptable false-negative
  for this task — the developer can pass `--skip-static-check`
  (out of scope for this task) or move the config inline. Note
  this limitation in the task summary if the test demands
  perfect coverage.

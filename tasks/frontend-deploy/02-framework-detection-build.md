# Task 02: Framework Detection and Build

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Objective

Implement `detectFramework(path)` and `buildFrontend(path,
framework)` in `cli/lib/frontend.mjs` so BOA can identify the
frontend framework and produce a build artifact.

## Target Tests

From `cli/__tests__/frontend-detect.test.mjs` (defined in
Task 01):
- All framework detection tests (vite, next, cra, static, null,
  priority)
- All build output dir tests (dist, out, build, passthrough)

## Implementation

### cli/lib/frontend.mjs

Replace the stubs for `detectFramework` and `buildFrontend`.

**`detectFramework(path)`:**
- Read `package.json` at the given path.
- If `devDependencies` or `dependencies` includes `vite`,
  return `'vite'`.
- If `devDependencies` or `dependencies` includes `next`,
  return `'next'`.
- If `devDependencies` or `dependencies` includes
  `react-scripts`, return `'cra'`.
- If no `package.json` but `index.html` exists at path,
  return `'static'`.
- Otherwise return `null`.

**`buildFrontend(path, framework)`:**
- Run the appropriate build command based on framework:
  - `'vite'`: `npx vite build` in the path directory. Output
    dir is `dist/`.
  - `'next'`: `npx next build && npx next export` in the path.
    Output dir is `out/`.
  - `'cra'`: `npx react-scripts build` in the path. Output
    dir is `build/`.
  - `'static'`: no build step. Output dir is the path itself.
- Use `child_process.execSync` or the existing pattern from
  `cli/lib/aws.mjs` for subprocess execution.
- Return the absolute path to the output directory.
- If the build command exits non-zero, throw with the stderr
  output.

**Path resolution (for `boa deploy frontend [path]`):**

The command resolves the frontend path with this precedence:
1. Explicit `--path` argument.
2. `frontend.path` field in `.boa/config.json`.
3. `./web` if it exists.
4. `./frontend` if it exists.
5. `.` if `index.html` exists at root.
6. Error: "Could not detect frontend directory."

This path resolution logic lives in the command
(`cli/commands/deploy-frontend.mjs`, Task 07) but document it
here so the implementer understands the broader context.

## Test Requirements

No additional tests beyond Task 01. The
`frontend-detect.test.mjs` tests from Task 01 are the target.

## Acceptance Criteria

- `detectFramework` correctly identifies all four framework
  types plus `null`.
- `buildFrontend` executes the correct command for each
  framework and returns the output dir path.
- New `frontend-detect.test.mjs` tests pass.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes are
  made, investigate whether the tests are true positives before
  marking the task complete.
- If `package.json` parsing requires additional edge cases not
  covered here (e.g., workspace setups), note them but do not
  escalate -- handle the common case.

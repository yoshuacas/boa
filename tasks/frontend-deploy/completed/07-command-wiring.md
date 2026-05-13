# Task 07: Subcommand Wiring, Teardown, Status, and Skill Docs

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md
**Depends on:** Tasks 02-06 (all library functions must be
implemented)

## Objective

Wire the `boa deploy frontend` subcommand, integrate frontend
teardown into `boa teardown`, display the frontend URL in
`boa status`, and update the skill documentation.

## Target Tests

No specific tests from Task 01 (this task wires existing
library functions into CLI surface area). Add a lightweight
integration test as described below.

## Implementation

### cli/commands/deploy-frontend.mjs (new file)

The main orchestration command. Default export:
`async function deployFrontend(args, opts = {})`.

**Flow:**

```
1. Read config (requireConfig)
2. Resolve frontend path:
   - args[0] || cfg.frontend?.path || './web' || './frontend'
     || '.' (if index.html exists) || error
3. Detect framework (detectFramework)
   - If null: error "Could not detect frontend framework in <path>"
4. Print: "Frontend: <path> (detected: <framework>)"
5. Print: "Backend: <stackName> (<region>)"
6. Build (buildFrontend)
   - Print: "Building... ✔ <duration>"
7. Scan for secrets (scanBundleForSecrets)
   - knownSecrets from config: { serviceRoleKey, jwtSecret }
   - If matches found: print details, exit(1)
   - If --skip-secret-scan: print warning, skip
   - Print: "Scanning bundle for secrets... ✔ clean"
8. Check source maps (findSourceMaps)
   - If found and no --allow-source-maps and no
     cfg.frontend?.allowSourceMaps: print details, exit(1)
   - Print: "Checking for source maps... ✔ none"
9. Write runtime config (writeRuntimeConfig)
10. Write headers (writeAmplifyHeaders)
11. Validate headers (validateHeaders)
    - Print warnings if any (non-blocking)
    - Print: "Validating headers... ✔ defaults applied"
12. Register CORS origin (registerOrigin + backend update)
    - Only if first deploy or origin changed
    - Print: "Registering origin in backend allow-list... ✔"
13. Create or reuse Amplify app:
    - If cfg.frontend?.amplifyAppId: reuse existing app
    - Else: createApp, createBranch, save to config
    - Print: "Creating Amplify app <name>... ✔"
14. Zip dist dir and deploy (startDeployment, waitForDeployment)
    - Print: "Deploying... ✔ <duration>"
15. Write config.json to Amplify (runtime config with correct
    cache headers)
16. Update config: frontend.amplifyAppId, frontend.amplifyDomain,
    frontend.deployedAt
17. Print final URLs:
    "Frontend: https://main.<appId>.amplifyapp.com"
    "Backend: <apiUrl>"
```

**Flags:**
- `--path <dir>`: override frontend directory.
- `--allow-source-maps`: skip source-map check.
- `--skip-secret-scan`: skip secret scan (prints warning).
- `--domain <domain>`: attach a custom domain.

### cli/commands/deploy.mjs (modify)

Add subcommand routing:

```javascript
export default async function deploy(args, opts) {
  const subcommand = args[0];
  if (subcommand === 'frontend') {
    const { default: deployFrontend } = await import('./deploy-frontend.mjs');
    return deployFrontend(args.slice(1), opts);
  }
  if (subcommand === 'backend') {
    return existingDeployLogic(args.slice(1), opts);
  }
  if (subcommand === 'all') {
    await existingDeployLogic([], opts);
    const { default: deployFrontend } = await import('./deploy-frontend.mjs');
    return deployFrontend([], opts);
  }
  // Default: existing backend deploy (backwards-compatible)
  return existingDeployLogic(args, opts);
}
```

### cli/commands/teardown.mjs (modify)

After the existing backend teardown logic, add:

1. Check `cfg.frontend?.amplifyAppId`.
2. If present, prompt: "Delete Amplify app <name>? (y/N)"
3. If confirmed, call `deleteApp({ appId, region })`.
4. Remove `frontend.*` fields from config.
5. Do NOT delete the custom domain's ACM certificate unless
   `--force` is passed.

### cli/commands/status.mjs (modify)

If `cfg.frontend?.amplifyDomain` is set, display:
```
Frontend: https://main.<appId>.amplifyapp.com
```
alongside the existing backend status output.

### cli/bin/boa.mjs (no change expected)

The existing router dispatches `deploy` to
`cli/commands/deploy.mjs`, which now handles the subcommand
internally. No changes needed to the entry point.

### Skill documentation updates

**plugin/skills/boa/SKILL.md** -- add a "Deploying a frontend"
section:
- After `boa deploy` succeeds, ask if there's a frontend.
- Confirm path (default `./web`).
- Run `boa deploy frontend`.
- If scan fails, show file/line, suggest fix, do not retry
  without human confirmation.
- Never auto-add `--skip-secret-scan` or `--allow-source-maps`.

**plugin/docs/PITFALLS.md** -- add three entries:
- "Service role key in frontend bundle"
- "Source maps in production"
- "CSP `unsafe-inline` for scripts"

**docs/GLOSSARY.md** -- add terms:
- **runtime config**: the `/config.json` file served by the
  frontend that contains backend connection details.
- **bundle scan**: the pre-deploy check that blocks deploys
  containing leaked secrets.
- **frontend deploy**: the `boa deploy frontend` command that
  builds, scans, and ships a SPA to AWS Amplify.

## Test Requirements

Add `cli/__tests__/deploy-frontend-command.test.mjs`:

- Given a project with `frontend.amplifyAppId` in config, when
  `boa deploy frontend` is run, then the existing app is reused
  (no createApp call).
- Given a project with no frontend config, when run, then
  createApp and createBranch are called.
- Given `--skip-secret-scan`, when run, then
  `scanBundleForSecrets` is not called and a warning is printed.
- Given `--allow-source-maps`, when run and source maps exist,
  then deploy proceeds without error.

Mock all AWS calls and the build step for these tests.

## Acceptance Criteria

- `boa deploy frontend` works end-to-end (with mocked AWS).
- `boa deploy` (bare) still works exactly as before.
- `boa deploy backend` is an alias for `boa deploy`.
- `boa deploy all` runs backend then frontend.
- `boa teardown` prompts for Amplify app deletion.
- `boa status` shows the frontend URL.
- Skill docs updated with new section and pitfalls.
- Glossary updated with new terms.
- All existing tests still pass.
- New `deploy-frontend-command.test.mjs` tests pass.

## Conflict Criteria

- If all target tests already pass before any code changes are
  made, investigate whether the tests are true positives before
  marking the task complete.
- If `cli/commands/deploy.mjs` uses a pattern that doesn't
  easily support subcommand routing (e.g., it's a single
  function with early returns), refactor minimally to add the
  routing without breaking existing behavior.
- If `teardown.mjs` has a different structure than expected,
  adapt the integration point rather than escalating.

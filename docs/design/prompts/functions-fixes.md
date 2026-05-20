Fix every issue documented in docs/code-review/functions.md (committed at HEAD on this branch). Read that review in full before designing.

Test-first discipline: for each finding, write the failing test first, watch it fail, then fix the production code to make it pass. Do not change the existing tests to be lenient — make them strict enough to catch the original bug.

Critical correctness bugs that must be fixed and covered by tests:
1. handler.mjs uses buildStubCtx instead of the real buildCtx — every function in production sees role:'anon'. Wire in the real buildCtx from ctx.mjs and add a routing-level test that asserts ctx.role and ctx.userId reach the user handler with a real JWT.
2. boa-client.mjs sends 'body' but handler.mjs reads 'event.payload' for cross-function invocation. Pick one shape, document it, fix both sides, add an end-to-end test where one function invokes another and the payload arrives intact.
3. 'boa functions invoke --service' on a private function returns 404 because it sends API Gateway event shape instead of direct-invoke shape with _boaInternal. Fix invokeFn to send the right shape for private functions; add a CLI test that asserts the invoke payload includes _boaInternal:{name:'...'} for private targets.
4. packageArtifacts in cli/lib/deploy.mjs duplicates discovery logic and skips all validation. Replace with a call to discover(); add a test that a function named 'v1' (reserved) is rejected through the deploy path.
5. packageFunctions([]) returns -Infinity for maxTimeout/maxMemory. Return sane defaults (30s, 256MB); add a test.

Other correctness/sustainability issues from the review that must also be fixed:
6. JWT signature comparison in ctx.mjs uses string compare; switch to crypto.timingSafeEqual.
7. The 'empty functions/ deploy' test contains '|| true' — make the assertion strict.
8. The '_internal rejected' test currently passes only because the pattern check fires first; either reorder validation or update the test to assert the specific failure path, with a separate test for an actually-reserved name like 'v1'.
9. handler.mjs imports/needs ctx.mjs after fix #1; remove buildStubCtx dead code.
10. parseArgs in commands/functions.mjs is fragile — the generic --flag handler always consumes the next arg. Refactor to a small allow-list of known flags so a future boolean flag can't swallow a positional.
11. logsFn shell-interpolates the function name; even though naming rules prevent injection, escape the value and add a defensive test.

Implementation order: write all failing tests first as a single commit ('test(functions): add failing tests for review findings'), then fix bugs in dependency order (token-model wiring first since it unblocks the routing assertions). After each fix, the corresponding test must pass. At the end, run node --test cli/__tests__/*.test.mjs and confirm zero failures.

Do not change the design document or the plan. Do not introduce new features.
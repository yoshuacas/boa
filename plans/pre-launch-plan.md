# BOA Pre-Launch Plan

**Created:** April 17, 2026 | **Launch:** April 28, 2026

---

## P0 -- Must ship (blocks launch)

### 1. Remove internal docs before repo goes public
`docs/internal/` contains competitive analysis (COMPETITIVE.md) and positioning notes (OPEN-SOURCE-POSITIONING.md). The repo goes public on April 28 under Apache-2.0 -- anyone can read them. The competitive framing ("converting developers from Supabase") violates AWS open source positioning tenets.

**Action:** Move to a private wiki or separate private repo, or delete from git history entirely (`git filter-repo`). A simple `rm` leaves them in history.
**Owner:** David
**Deadline:** April 25 (before any public preview)

### 2. Website copy review and approval
Website content is complete -- no placeholders, no TODOs. But it needs a final editorial and stakeholder approval pass.

- [ ] Final copy edit of all pages (index, pricing, install, docs hub) for typos, tone, accuracy
- [ ] Stakeholder review of messaging and positioning
- [ ] Verify all pricing data is current (last regenerated April 14)
- [ ] Approve and deploy to production hosting

**Deadline:** April 25 (copy freeze)

### 3. Skill full eval pass on Linux
The skill has 15 evals with a 99% pass rate on macOS, but EC2 Linux testing is still pending (instance `i-0c19497fb5d4911a5` in us-east-2). The skill ships for all platforms.

- [ ] Run `boa init` -> `boa deploy` -> `boa migrate` end-to-end on the EC2 instance
- [ ] Run the full eval suite (6 scenarios, 4 rubrics) on Linux
- [ ] Validate the skill loads correctly in Claude Code on Linux

**Deadline:** April 22

### 4. Skill publishing to marketplace
The plugin is code-complete but needs marketplace submission.

- [ ] Final check of `plugin.json` metadata, version, description
- [ ] Submit to Claude marketplace
- [ ] Verify discovery and install flow works for a new user
- [ ] Cross-check AGENTS.md for VS Code Copilot / Codex compatibility

**Deadline:** April 25 (allow 3 days for marketplace review)

---

## P1 -- Should ship (significantly improves launch quality)

### 5. Run skill-creator evals on secondary skills
`boa-doctor`, `boa-manage`, and `boa-pricing` were drafted as of April 12. They need eval runs via the skill-creator plugin to validate quality.

- [ ] Run skill-creator evals on each of the 3 secondary skills
- [ ] Fix any failures
- [ ] Promote from "drafted" to production

**Deadline:** April 24

### 6. Security review of all open-sourced code
Every codebase that goes public on April 28 needs a security review before release. Owner: **David Castro**.

**Scope (per codebase):**
- [ ] `plugin/` -- skill, CLI, lambda-templates, SKILL.md, AGENTS.md
- [ ] `website/` -- static HTML/JS, pricing generator, no server-side code
- [ ] `dashboard/` -- local management UI, AWS CLI bridge
- [ ] `evals/` -- scenarios, rubrics, harness
- [ ] `pgrest-lambda` (npm package) -- REST + auth engine
- [ ] `@boa-cloud/client` (npm package) -- client SDK
- [ ] `storage-lambda`, `events-lambda` -- design docs only; review if any code lands pre-launch

**Per-codebase checks:**
- [ ] Scan git history for accidentally committed secrets (AWS keys, tokens, `.env` files) via `gitleaks` or `trufflehog`
- [ ] Review SAM/CloudFormation templates for overly permissive IAM policies (no `*:*`, least-privilege on S3/DSQL/Cognito)
- [ ] Review Lambda handler code for injection risks (SQL, command, header/path traversal)
- [ ] Verify no hardcoded credentials, private endpoints, or internal URLs in any file
- [ ] `npm audit` on every package.json; resolve or document high/critical findings
- [ ] Check LICENSE + third-party attributions (NOTICE) are complete
- [ ] Verify `.gitignore` covers local state, SAM artifacts, and `dashboard/` session data

**Owner:** David Castro
**Deadline:** April 23 (all reviews complete, findings triaged before April 25 copy freeze)

### 7. @boa-cloud/client npm publish
The client library was completed April 17. It needs to be published to npm.

- [ ] Final review of package.json (name, version, license, repository)
- [ ] Publish to npm
- [ ] Verify install and basic import works from a fresh project
- [ ] Update website install docs if the package name or version changed

**Deadline:** April 22

---

## P2 -- Nice to have (improves launch but not blocking)

### 8. storage-lambda and events-lambda integration
Both libraries have completed design docs but are not yet implemented. These provide Supabase Storage and Realtime compatibility.

**Current state:** pgrest-lambda (REST + auth) is the only companion library that's live. Storage uses raw S3 presigned URLs, not a Supabase-compatible storage API. Realtime is out of scope entirely.

**Recommendation:** Do NOT attempt before launch. Document as "coming soon" on the website and in the skill docs. Ship the MVP without them.

**Post-launch milestone:** May 2026

### 9. Dashboard smoke test
The dashboard is functional but is a local-only management UI.

- [ ] Smoke test each page (index, api, auth, database, functions, storage)
- [ ] Verify AWS CLI bridge generates correct commands for current SAM template

**Deadline:** April 26

### 10. Architecture docs freshness
Architecture docs were refreshed April 14. The ALB+WAF change (replacing CloudFront) landed April 11. Verify no stale CloudFront references remain.

- [ ] Grep for CloudFront references in website/ and plugin/ docs
- [ ] Update any stale references

**Deadline:** April 24

---

## Timeline

```
Apr 17          Plan created
Apr 18-20       EC2 Linux testing, security review, npm publish
Apr 21-22       Skill evals on Linux complete, client lib published
Apr 23          Security review complete
Apr 24          Skill-creator evals done, architecture docs verified
Apr 25          Copy freeze, internal docs removed, marketplace submission
Apr 26          Dashboard smoke test, final regression check
Apr 27          Buffer day
Apr 28          LAUNCH
```

---

## Pending capabilities

| Capability | Status | Ships at launch? |
|---|---|---|
| REST API (PostgREST-compat) | Shipped (pgrest-lambda 0.1.1) | Yes |
| Auth (GoTrue-compat) | Shipped | Yes |
| Database (Aurora DSQL) | Shipped | Yes |
| Cedar authorization | Shipped | Yes |
| S3 storage (presigned URLs) | Shipped (raw, not Supabase-compat) | Yes |
| Supabase Storage API | Designed, not implemented | No -- post-launch |
| Realtime/events | Designed, not implemented | No -- post-launch |
| OAuth providers | Not in scope | No -- post-launch |
| @boa-cloud/client | Built, not published to npm | Yes (publish by Apr 22) |

---

## Risk summary

**Highest risk:** Internal docs in public repo (#1). If someone previews the repo before launch and those files are there, it's a positioning problem.

**Everything else** is execution -- the code is done, it needs validation and publishing.

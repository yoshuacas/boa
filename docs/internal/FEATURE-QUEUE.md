# BOA Feature Queue (Internal)

Ideas, not commitments. Each entry: the problem observed, the proposed direction, why it matters. Ordered loosely by impact, not by schedule.

---

## Deployment-failure recovery that agents can drive

**Problem observed (2026-04-24).** First new-developer e2e test of `boa init` failed mid-deploy with two CloudFormation errors:

1. `AWS::EC2::VPC` — "The maximum number of VPCs has been reached" (account at 5/5).
2. `AWS::DSQL::Cluster` — "Account quota of 20 clusters reached."

The SAM deploy rolled back. Partial resources (S3 bucket, IAM role, WAF, IGW) were created and then deleted during rollback. The CLI surfaced the raw CloudFormation error stream, which is accurate but opaque: a developer sees hundreds of lines of `CREATE_IN_PROGRESS` / `CREATE_FAILED` / `DELETE_COMPLETE`, has to skim it for the actual message, and then has to figure out what to delete to free quota. An agent helping the developer has the same problem, plus no safe primitive for "delete my leftovers."

This is the class of failure that will hit every new developer on day one — account quotas, partial deploys, shared-account collisions. It's also the class BOA's "guardrails" positioning promises to handle.

**Proposed direction.**

1. **Parse CloudFormation failures into actionable categories.** The CLI already watches the deploy stream. When rollback happens, extract the `CREATE_FAILED` reasons, classify them (quota, permission, duplicate name, network), and print a structured diagnosis. Example:
   ```
   Deploy failed. Root cause: quota exhausted.

     Resource         Limit                 Current  Action
     VPC              5 per region          5        Request increase OR delete unused
     DSQL cluster     20 per account        20       Delete unused clusters

   Your other BOA stacks (safe to delete): boa-cars-test, boa-temp-test, boa-demo
   Other stacks in this account (not yours): EcoffsiteVpc, DeboraAI-*, 10 more
   ```

2. **A `boa reap` command** (or `boa cleanup`, `boa nuke --mine`) that lists **only stacks this CLI has tracked** — driven by a local registry (`~/.config/boa/deployments.json` or similar) written on every `boa init`. The CLI knows which stacks it created; the developer does not have to remember, and an agent can safely call it without risk of wiping teammate infra.

3. **Never propose a destructive action on something the CLI didn't create.** Even when the diagnosis spots leftover DSQL clusters, the CLI should show them as informational and stop at: "these look orphaned, here's the AWS Console link" rather than `--delete`. Teammate-owned resources should be a hard "no" for automated cleanup.

4. **Pre-flight quota check in `boa init`.** Before `sam build`, hit `service-quotas` for VPC and DSQL counts and fail fast with the same structured message if capacity is already short. Currently the failure happens 3-5 minutes into deploy after real resources were created and destroyed.

5. **Agent-readable error output.** Every structured diagnosis should also emit a machine-readable JSON artifact (maybe `.boa/last-deploy-failure.json`) so an agent loading the skill can reason over it without scraping terminal output. This is the "built for agents" piece of the product promise made concrete.

**Why it matters.** BOA's core pitch is "skip the AWS complexity." Today, the first real failure mode exposes all of it. Supabase / Firebase fail gracefully when you blow their free tier; AWS fails with raw CloudFormation events. Closing this gap is what separates "AWS with a nice wrapper" from "a backend that just works."

**Related.** See `plans/developer-cx-map.md` and `plans/e2e-testing-plan.md` — this likely belongs inside one of those once it's scoped. Also ties to the pre-launch plan's "failure path documentation" item.

**Status.** Proposed 2026-04-24 after real failure during e2e validation. Not scheduled.

---

## Bootstrap the `auth.sessions` table on `boa init`

**Problem observed (2026-04-24).** pgrest-lambda v0.2.0 implements V-07 (session-ID indirection for refresh tokens) by storing server-side sessions in a PostgreSQL `auth.sessions` table. The CHANGELOG flags this as breaking: "Cognito deployments now require a PostgreSQL database for session storage (`auth.sessions` table)."

BOA's `boa init` provisions DSQL + Cognito + the Lambda, but does **not** create the `auth.sessions` schema. Signup through `/auth/v1/signup` returns HTTP 500 with `{"error":"42P01"}` (PostgreSQL "undefined table") because pgrest-lambda tries to insert a session row before the table exists. Every fresh `boa init` against v0.2.0 is broken out of the box for auth.

**Proposed direction.**

1. **Preferred: pgrest-lambda bootstraps the table on first use.** Migrations inside a library-consumer boundary are awkward — BOA shouldn't have to know about pgrest-lambda's internal schema. pgrest-lambda could run an idempotent `CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.sessions (...);` during warm-up or on first auth request. This keeps BOA unchanged when pgrest-lambda adds future internal state.

2. **Alternative: BOA ships a bootstrap migration.** Add `cli/templates/migrations/0000_auth_sessions.sql` and run it as part of `boa init` after DSQL is reachable. Downside: every time pgrest-lambda changes its internal schema, BOA has to ship a corresponding migration update — the coupling we were trying to avoid by pinning by version.

3. **Verify gap.** `boa verify` currently passes even when auth is broken (the ALB returns HTTP 200 at `/rest/v1/`, which is the only endpoint it checks). Add a signup smoke test to `verify` so this class of regression fails loudly, not silently.

**Why it matters.** This is the first thing every developer tries after `boa init`. If it returns a 500 with a PostgreSQL error code, the "built for agents, free until your users show up" promise is broken before they've added a user. It also exposes a structural issue: BOA's guardrails need to cover engine-version compatibility, not just deployment shape.

**Status.** Proposed 2026-04-24 after e2e validation. Not scheduled. Related to pgrest-lambda v0.2.0 release and the deployment-failure-recovery item above.

---

## `boa teardown` leaves the DSQL cluster behind

**Problem observed (2026-04-24).** End-to-end validation of `boa teardown` reported success ("Teardown complete. Stack 'e2e-test' has been destroyed.") but left the DSQL cluster `xftxa5woopmnhb2rfpquapapp4` intact. Had to delete it manually with `aws dsql delete-cluster` to return to 0/20 quota.

Root cause: the SAM template (`cli/templates/backend.yaml`) sets `DeletionPolicy: Retain` on `DsqlCluster`. When CloudFormation deletes the stack, the cluster is disassociated but not destroyed — consistent with Critical Rule #8 ("DSQL: IAM auth tokens, never hardcoded credentials" — the spirit being "data protected by default"). `teardown.mjs` disables deletion protection on the cluster (step 7) but never issues `aws dsql delete-cluster`. So the cluster survives the stack delete and keeps consuming DSQL quota.

Same issue likely affects:
- **Cognito User Pool** (`DeletionPolicy: Retain` + `DeletionProtection: ACTIVE`). Teardown disables the protection but does not call `aws cognito-idp delete-user-pool`.
- **S3 bucket** — if `DeletionPolicy: Retain` is set, the emptied bucket survives the stack delete.

**Proposed direction.**

1. **After `sam.remove(stackName, region)`, explicitly delete the Retained resources that `boa teardown` already disabled protection on:** DSQL cluster, Cognito user pool, S3 bucket. The CLI knows their IDs from `config.json`. Missing this step is strictly a bug — once the user has confirmed destruction with the stack name, there is no reason to keep these around.

2. **Decide the retention story for the non-teardown path.** `DeletionPolicy: Retain` exists to protect against accidental stack deletion via some other tool (CloudFormation console, a misbehaving deploy, etc.). `boa teardown` is the opposite case — it is the user explicitly asking for full destruction. Those two code paths should behave differently, and today they do not.

3. **Post-teardown verification.** After deletion, `boa teardown` should verify the cluster and user pool are actually gone (or in DELETING state) and report accordingly. Silent partial cleanup is worse than a loud failure.

**Why it matters.** Every developer who runs a `boa init` / `boa teardown` cycle during testing accumulates orphan DSQL clusters and Cognito pools. The DSQL cluster limit is 20/account — it takes one afternoon of iteration to hit. That is how the us-east-2 account arrived at 20/20 clusters blocking today's initial e2e run. The cleanup work to recover from that (multiple conversations, per-cluster audits to distinguish yours from teammates') was significant and avoidable. Related to the "Deployment-failure recovery" item: reliable teardown is the other half of reliable deployment.

**Status.** Proposed 2026-04-24 after `boa teardown` on `e2e-test` stack. Not scheduled.

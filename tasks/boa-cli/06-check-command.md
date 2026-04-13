# Task 06: check Command

**Agent:** implementer
**Design:** docs/design/boa-cli.md
**Depends on:** Task 05

## Objective

Implement `cli/commands/check.mjs`, porting
`plugin/scripts/check-tools.sh` to Node.js. Checks
required tools and AWS credentials.

## Target Tests

No unit tests (this command probes the local environment
for installed tools and AWS credentials). Verified via
manual integration testing.

## Implementation

Replace the stub in `cli/commands/check.mjs`. Port the
logic from `plugin/scripts/check-tools.sh`:

1. Detect platform (`process.platform`):
   - `darwin` -> "macOS"
   - `linux` -> "Linux"
   - other -> the raw value
2. Check each tool (aws, sam, node, psql, jq) by running
   its version command via `aws.exec()`. Extract the
   version number (first X.Y.Z match). Print version or
   "MISSING".
3. Check AWS credentials via `aws.stsGetCallerIdentity()`.
   Print account ID or "NOT CONFIGURED".
4. Check default region via `aws.exec('aws configure get
   region')`. Print region. If not a DSQL-supported region
   (us-east-1 or us-east-2), print a note.
5. If any tools are missing, print platform-specific
   install instructions:
   - macOS: `brew install awscli aws-sam-cli node jq libpq
     && brew link --force libpq`
   - Linux: reference BOA docs
6. Exit 0 if all tools found and credentials valid.
   Exit 1 otherwise.

Use `lib/aws.mjs` for `exec()` and `stsGetCallerIdentity()`.
Catch errors from `exec()` to detect missing tools (command
not found results in a thrown error).

**Output format** (matches the design's example):
```
Platform: macOS

Tools:
  aws        2.15.0
  sam        1.120.0
  node       20.11.0
  psql       16.2
  jq         1.7

AWS credentials:
  account    123456789012

Region:
  default    us-east-1
```

## Acceptance Criteria

- `node cli/bin/boa.mjs check` runs without errors on a
  machine with all tools installed.
- Output matches the design's format.
- Exit code is 0 when all checks pass, 1 when any fail.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.

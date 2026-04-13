# Task 08: deploy Command

**Agent:** implementer
**Design:** docs/design/boa-cli.md
**Depends on:** Task 03, Task 05

## Objective

Implement `cli/commands/deploy.mjs`, porting
`plugin/scripts/deploy.sh` to Node.js. Rebuilds and
redeploys the stack using the existing config.

## Target Tests

No unit tests (this command interacts with AWS
infrastructure). Verified via manual integration testing.

## Implementation

Replace the stub in `cli/commands/deploy.mjs`. Port the
logic from `plugin/scripts/deploy.sh`:

1. Load config via `config.requireConfig()`. This handles
   the "config not found" error case.
2. Read `stackName` and `region` from config.
3. Print header: `Deploying stack '<name>' in region
   '<region>'...`
4. Resolve template path relative to the CLI package
   (same as init command).
5. Run `sam.build()` with template file and build dir
   `.boa/.aws-sam/build`.
6. If `policies/` directory exists, copy Cedar policies
   into `.boa/.aws-sam/build/ApiFunction/policies`.
   Use `fs.cpSync` with `{ recursive: true }`.
7. Run `sam.deploy()` with the built template at
   `.boa/.aws-sam/build/template.yaml`.
8. Extract fresh CloudFormation outputs via
   `aws.cfnDescribeStacks()`.
9. Update config: preserve `anonKey`, `serviceRoleKey`,
   `accountId` from the existing config. Update `apiUrl`,
   `userPoolId`, `userPoolClientId`, `bucketName`,
   `dsqlEndpoint`, `deployedAt` from fresh outputs.
   Write via `config.write()`.
10. If `migrations/` directory has `.sql` files, run
    migrations by dynamically importing and calling the
    migrate command.
11. Print summary: deploy complete, config updated, API URL.

**Config update logic (critical):**
The deploy command must NOT regenerate keys or overwrite
`anonKey`, `serviceRoleKey`, or `accountId`. These are
preserved from the existing config. Only infrastructure
outputs and `deployedAt` are refreshed.

**Output format** (matches design example):
```
Deploying stack 'my-app' in region 'us-east-1'...

Building SAM application...
  ...SAM build output...

Deploying...
  ...SAM deploy output...

Updating configuration...

Deploy complete. Configuration updated at .boa/config.json
API URL: https://xxx.execute-api.us-east-1.amazonaws.com/prod
```

## Acceptance Criteria

- `node cli/bin/boa.mjs deploy` in a directory without
  `.boa/config.json` prints the config-not-found error
  and exits 1.
- Full deploy flow works against a real AWS account after
  `boa init` (manual integration test).
- Config keys are preserved across deploy.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.

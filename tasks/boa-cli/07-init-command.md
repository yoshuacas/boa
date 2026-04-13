# Task 07: init Command

**Agent:** implementer
**Design:** docs/design/boa-cli.md
**Depends on:** Task 02, Task 03, Task 04, Task 05

## Objective

Implement `cli/commands/init.mjs`, porting
`plugin/scripts/bootstrap.sh` to Node.js with project
scaffolding. This is the main command that creates a new
BOA project and deploys the full stack.

## Target Tests

From `cli/__tests__/validate.test.mjs`:
- "my-app" passes validateStackName
- "test123" passes
- "a" passes
- "my-app-v2" passes
- "My_App" fails with message about lowercase
- "test app" fails
- "test@app" fails
- "" fails
- "MY-APP" fails
- "us-east-1" passes validateRegion
- "us-east-2" passes validateRegion
- "eu-west-1" fails with message about DSQL regions
- "ap-southeast-1" fails
- "" fails

## Implementation

Replace the stub in `cli/commands/init.mjs`. The command
must export:
- Default export: `async function init(args)` -- the
  command handler.
- Named exports: `validateStackName(name)` and
  `validateRegion(region)` -- pure validation functions
  for testing.

### Argument parsing

Parse `args` array for:
- First positional arg: stack name (optional; defaults
  to `path.basename(process.cwd())`)
- `--region <region>`: AWS region (optional; defaults
  to AWS CLI config region)

### Validation functions

```javascript
export function validateStackName(name) {
  return /^[a-z0-9-]+$/.test(name);
}

export function validateRegion(region) {
  return ['us-east-1', 'us-east-2'].includes(region);
}
```

### Steps (ported from bootstrap.sh)

1. Parse args for name and --region.
2. Check prerequisites (aws, sam, node, psql, jq) by
   running version commands. Print `[OK] <tool> <version>`
   for each. Fail with install instructions if missing.
3. Check AWS credentials via `aws.stsGetCallerIdentity()`.
   Print account ID. On failure, print the exact error
   messages from the design.
4. Resolve region: use --region flag, or AWS config, or
   fail. Validate with `validateRegion()`.
5. Validate stack name with `validateStackName()`. Print
   exact error message from design on failure.
6. If name is provided and directory doesn't exist, create
   it and `process.chdir()` into it.
7. Scaffold: create `migrations/`, `policies/`, `.boa/`,
   write `.gitignore` with `.boa/` and `node_modules/`.
8. Generate JWT secret: 32 random bytes via
   `crypto.randomBytes(32).toString('base64')`.
9. Store in SSM via `aws.ssmPutParameter()`.
10. Resolve template path relative to the CLI package:
    `path.join(__dirname, '..', 'templates', 'backend.yaml')`
    using `import.meta.url` and `fileURLToPath`.
11. SAM build via `sam.build()` with build dir
    `.boa/.aws-sam/build`.
12. If `policies/` has files, copy them to
    `.boa/.aws-sam/build/ApiFunction/policies`.
13. SAM deploy via `sam.deploy()` with built template at
    `.boa/.aws-sam/build/template.yaml`.
14. Extract outputs via `aws.cfnDescribeStacks()`. Parse
    ApiUrl, UserPoolId, UserPoolClientId, BucketName,
    DsqlEndpoint from the Outputs array.
15. Generate keys via `keys.generateKeys(jwtSecret)`.
16. Write config via `config.write()` with all fields
    including `deployedAt` as ISO string.
17. If `migrations/` has `.sql` files, dynamically import
    and call the migrate command.
18. Print summary matching the design's example output.

### Error messages (exact text from design)

- Bad stack name:
  `Error: Stack name must contain only lowercase letters, numbers, and hyphens.`
- Bad region:
  `Error: Aurora DSQL requires us-east-1 or us-east-2. Got: <region>`
- Bad credentials:
  `Error: AWS credentials are not configured or are invalid.`
  `Run 'aws configure' or 'aws sso login' first.`
- Missing tool:
  `Error: <tool> is not installed.`

## Acceptance Criteria

- All validate.test.mjs tests pass.
- `node cli/bin/boa.mjs init bad_name!` prints validation
  error and exits 1.
- `node cli/bin/boa.mjs init my-app --region eu-west-1`
  prints region error and exits 1.
- Full init flow works against a real AWS account (manual
  integration test).
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the SAM template path resolution does not work as
  described (e.g., `import.meta.url` resolves differently
  when symlinked via `npm link`), investigate and adjust
  the resolution strategy.

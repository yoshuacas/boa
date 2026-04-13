# Task 05: AWS/SAM Wrappers and Template Copy

**Agent:** implementer
**Design:** docs/design/boa-cli.md

## Objective

Implement `cli/lib/aws.mjs` and `cli/lib/sam.mjs` (shell
wrappers for AWS CLI and SAM CLI), then copy the SAM
template and Lambda handlers into `cli/templates/` with
the `CodeUri` adjustment.

## Target Tests

No direct unit tests (these modules wrap `child_process`
calls to external tools). Correctness is verified through
manual integration testing and by subsequent command tasks.

## Implementation

### cli/lib/aws.mjs

Create per the design's Shell Execution section:

- `exec(cmd, opts)` -- wraps `execSync`, returns trimmed
  stdout. Used for queries that return data.
- `run(cmd, opts)` -- wraps `spawnSync` with `shell: true`
  and `stdio: 'inherit'`. Used for long-running commands
  where output should stream to the terminal. Throws on
  non-zero exit code.
- `stsGetCallerIdentity()` -- returns parsed JSON from
  `aws sts get-caller-identity`.
- `cfnDescribeStacks(stackName, region)` -- returns parsed
  Outputs array from `aws cloudformation describe-stacks`.
- `ssmPutParameter(name, value, region)` -- stores a String
  parameter with `--overwrite`.
- `dsqlGenerateAuthToken(endpoint, region)` -- returns the
  auth token string from `aws dsql
  generate-db-connect-admin-auth-token`.

### cli/lib/sam.mjs

Create per the design's SAM Wrapper section:

- `build(templateFile, buildDir, region)` -- runs `sam build`
  with the given template file, build dir, and region.
- `deploy(templateFile, stackName, region)` -- runs
  `sam deploy` with all required flags (--resolve-s3,
  --no-confirm-changeset, --no-fail-on-empty-changeset,
  --capabilities, --parameter-overrides).
- `remove(stackName, region)` -- runs `sam delete` with
  `--no-prompts`.

### cli/templates/backend.yaml

Copy `plugin/templates/backend.yaml` to
`cli/templates/backend.yaml`. Change both `CodeUri`
references:

- `ApiFunction` CodeUri: `../lambda-templates/` -> `./lambda/`
- `AuthorizerFunction` CodeUri: `../lambda-templates/` ->
  `./lambda/`

No other changes. All resource definitions, parameters,
outputs remain identical.

### cli/templates/lambda/

Copy these files verbatim from `plugin/lambda-templates/`:

- `index.mjs`
- `authorizer.mjs`
- `presigned-upload.mjs`
- `package.json`
- `package-lock.json`

These are exact copies -- no modifications needed.

## Acceptance Criteria

- `cli/lib/aws.mjs` exports all listed functions.
- `cli/lib/sam.mjs` exports `build`, `deploy`, `remove`.
- `cli/templates/backend.yaml` exists and differs from
  `plugin/templates/backend.yaml` only in the two `CodeUri`
  values.
- `cli/templates/lambda/` contains all five files, each
  identical to the plugin originals.
- Existing tests still pass.

## Conflict Criteria

- If `plugin/templates/backend.yaml` has more than two
  `CodeUri` references (indicating the template structure
  has changed since the design was written), investigate
  and adjust all CodeUri references to `./lambda/`.
- If any Lambda handler files referenced in the design do
  not exist in `plugin/lambda-templates/`, escalate.

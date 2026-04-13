# BOA CLI

## Overview

Replace the shell scripts in `plugin/scripts/` with a Node.js
CLI package (`boa-cli`) that becomes the single interface for
all BOA backend operations. Both developers and AI agents use
the same commands: `boa init`, `boa deploy`, `boa migrate`,
`boa verify`, `boa teardown`, `boa status`, `boa check`. The
CLI lives at `cli/` in the repo root and will be published to
npm as `boa-cli` with a `boa` binary.

The scripts are proven and deployed. The CLI ports their logic
faithfully to Node.js ESM without redesigning behavior. It
shells out to `aws` and `sam` CLIs (same as the scripts) to
keep dependencies minimal and avoid the AWS SDK.

## Current CX / Concepts

### Script-Based Operations

BOA backend operations are currently shell scripts in
`plugin/scripts/`:

| Script | Purpose |
|--------|---------|
| `bootstrap.sh` | First-time deploy: check prereqs, generate JWT secret, SAM build/deploy, extract outputs, generate keys, write `.boa/config.json`, run migrations |
| `deploy.sh` | Redeploy: read config, SAM build/deploy, bundle Cedar policies, refresh config, run migrations |
| `migrate.sh` | Apply pending SQL migrations with checksums, create `_boa_migrations` tracking table, refresh PostgREST schema cache |
| `verify.sh` | Post-deploy checks: Cognito self-signup, API returns 401, S3 bucket private |
| `teardown.sh` | Destroy stack: interactive confirmation, disable deletion protection, empty S3, delete stack, clean SSM, remove `.boa/` |
| `check-tools.sh` | Check prerequisites: aws, sam, node, psql, jq, AWS credentials, region |
| `generate-keys.mjs` | Generate anon key and service role key JWTs (pure Node.js crypto, no dependencies) |

### Problems

1. **Developer dependency on the agent.** After bootstrap,
   the developer has `.boa/config.json` and `migrations/`
   but no way to deploy, migrate, or verify without asking
   the agent. The project is not self-sufficient.

2. **The agent leaks plugin internals.** The agent references
   `deploy.sh`, `migrate.sh`, and script paths that don't
   exist in the developer's project directory. The developer
   can't act on these instructions independently.

3. **Scripts require the plugin directory.** Every script
   resolves paths relative to `plugin/` for the SAM template
   and Lambda handlers. The developer can't run them outside
   the plugin repo.

### Config Format

`bootstrap.sh` writes `.boa/config.json` with this structure
(must remain backwards-compatible):

```json
{
  "stackName": "my-app",
  "region": "us-east-1",
  "accountId": "123456789012",
  "apiUrl": "https://xxx.execute-api.us-east-1.amazonaws.com/prod",
  "anonKey": "eyJhbGciOiJIUzI1NiIs...",
  "serviceRoleKey": "eyJhbGciOiJIUzI1NiIs...",
  "userPoolId": "us-east-1_xxxxx",
  "userPoolClientId": "xxxxxxxxx",
  "bucketName": "my-app-storage-123456",
  "dsqlEndpoint": "xxx.dsql.us-east-1.on.aws",
  "deployedAt": "2026-04-11T12:00:00Z"
}
```

### Templates and Handlers

The SAM template (`plugin/templates/backend.yaml`) and Lambda
handlers are proven and deployed. They are copied into the CLI
package unchanged:

- `backend.yaml` -- SAM template defining DSQL, Cognito, API
  Gateway with BOA Lambda authorizer, Lambda functions, and S3
- `index.mjs` -- Main handler routing `/upload` and `/download`
  to presigned-upload, everything else to pgrest-lambda
- `authorizer.mjs` -- Re-exports `pgrest.authorizer` from
  pgrest-lambda
- `presigned-upload.mjs` -- Presigned URL generation for S3
  uploads/downloads with content type validation

## Proposed CX / CX Specification

### Command Overview

```
boa <command> [options]

Commands:
  init <name>    Scaffold project, deploy stack, write config
  deploy         Rebuild and redeploy the stack
  migrate        Apply pending SQL migrations
  verify         Check all stack components
  teardown       Destroy the stack (with confirmation)
  status         Show stack info, tables, pending migrations
  check          Check required tools and AWS credentials

Options:
  --version      Print CLI version
  --help         Show help
```

### `boa init <name>`

Create a new BOA project, deploy the full serverless stack,
and write `.boa/config.json`.

```
boa init my-app
boa init my-app --region us-east-2
boa init                            # uses current folder name
```

**Arguments:**
- `<name>` -- Project/stack name (optional; defaults to
  current directory name). Must match `[a-z0-9-]+`.

**Options:**
- `--region <region>` -- AWS region (default: from AWS CLI
  config). Must be `us-east-1` or `us-east-2` (DSQL
  regions).

**Steps (ported from bootstrap.sh):**

1. Check prerequisites (aws, sam, node, psql, jq). Fail with
   install instructions if any are missing.
2. Check AWS credentials via `aws sts get-caller-identity`.
   Print account ID on success, guide to `aws configure` on
   failure.
3. Validate region supports DSQL.
4. If `<name>` is given and a directory with that name does
   not exist, create it and `cd` into it.
5. Scaffold project structure:
   ```
   my-app/
   ├── migrations/
   ├── policies/
   ├── .boa/
   └── .gitignore       # .boa/, node_modules/
   ```
6. Generate 32-byte random JWT secret via Node.js `crypto`.
7. Store JWT secret in SSM at `/<stack-name>/jwt-secret`
   (type String, with `--overwrite`).
8. Run `sam build` with `--template-file` pointing to the
   CLI package's `templates/backend.yaml` and `--build-dir`
   set to `.boa/.aws-sam/build`. SAM resolves `CodeUri`
   relative to the template file location.
9. If `policies/` directory exists, copy Cedar policies into
   the SAM build directory at
   `.boa/.aws-sam/build/ApiFunction/policies`.
10. Run `sam deploy` with the built template at
    `.boa/.aws-sam/build/template.yaml`, plus `--resolve-s3`,
    `--no-confirm-changeset`, `--no-fail-on-empty-changeset`,
    `--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM`,
    `--parameter-overrides ProjectName=<stack-name>`.
11. Extract CloudFormation outputs (ApiUrl, UserPoolId,
    UserPoolClientId, BucketName, DsqlEndpoint) via
    `aws cloudformation describe-stacks`.
12. Generate anon key and service role key using
    `lib/keys.mjs`.
13. Write `.boa/config.json` with all fields.
14. If `migrations/` directory has `.sql` files, run
    migrations (same as `boa migrate`).
15. Print summary with API URL, truncated keys, resource IDs,
    and next steps.

**Validation rules:**
- Stack name must match `[a-z0-9-]+`. Error:
  `Error: Stack name must contain only lowercase letters, numbers, and hyphens.`
- Region must be `us-east-1` or `us-east-2`. Error:
  `Error: Aurora DSQL requires us-east-1 or us-east-2. Got: <region>`
- AWS credentials must be valid. Error:
  `Error: AWS credentials are not configured or are invalid.`
  `Run 'aws configure' or 'aws sso login' first.`
- All prerequisites must be installed. Error per tool:
  `Error: <tool> is not installed.`
  (followed by platform-specific install instructions)

**Example output:**
```
Checking prerequisites...
  [OK] aws 2.15.0
  [OK] sam 1.120.0
  [OK] node 20.11.0
  [OK] psql 16.2
  [OK] jq 1.7

Verifying AWS credentials...
  [OK] Authenticated as account 123456789012
  [OK] Region: us-east-1

Generating JWT secret...
  [OK] JWT secret stored at /my-app/jwt-secret

Building SAM application...
  ...SAM build output...

Deploying stack 'my-app' to us-east-1...
  ...SAM deploy output...

Extracting stack outputs...
Generating BOA keys...
  [OK] Anon key and service role key generated

Configuration written to .boa/config.json

======================================
  BOA deployment complete
======================================

  API URL:          https://xxx.execute-api.us-east-1.amazonaws.com/prod
  Anon Key:         eyJhbGciOiJIUzI1NiIs...
  Service Role Key: eyJhbGciOiJIUzI1NiIs...
  User Pool ID:     us-east-1_xxxxx
  Client ID:        xxxxxxxxx
  S3 Bucket:        my-app-storage-123456
  DSQL Endpoint:    xxx.dsql.us-east-1.on.aws
```

### `boa deploy`

Rebuild and redeploy the stack. Reads `.boa/config.json` for
stack name and region.

```
boa deploy
```

**Steps (ported from deploy.sh):**

1. Read `.boa/config.json`. Error if missing:
   `Error: .boa/config.json not found. Run 'boa init' first.`
2. Run `sam build` with `--template-file` pointing to the
   CLI package's `templates/backend.yaml` and `--build-dir`
   set to `.boa/.aws-sam/build`.
3. If `policies/` directory exists, copy Cedar policies into
   the SAM build at `.boa/.aws-sam/build/ApiFunction/policies`.
4. Run `sam deploy` with the built template at
   `.boa/.aws-sam/build/template.yaml`, same flags as init.
5. Extract fresh CloudFormation outputs.
6. Update `.boa/config.json` with new outputs (preserve
   `anonKey`, `serviceRoleKey`, `accountId`; update
   `apiUrl`, `userPoolId`, `userPoolClientId`, `bucketName`,
   `dsqlEndpoint`, `deployedAt`).
7. If `migrations/` directory has pending `.sql` files, run
   migrations.
8. Print deploy summary with API URL.

**Example output:**
```
Deploying stack 'my-app' in region 'us-east-1'...

Building SAM application...
  ...SAM build output...

Deploying...
  ...SAM deploy output...

Updating configuration...

Deploy complete. Configuration updated at .boa/config.json
API URL: https://xxx.execute-api.us-east-1.amazonaws.com/prod

Running database migrations...
  [skip] 001_create_todos.sql
Migration complete: 0 applied, 1 skipped.
```

### `boa migrate`

Apply pending SQL migrations from `migrations/` to DSQL.
Tracks applied migrations in a `_boa_migrations` table with
checksums.

```
boa migrate
boa migrate --dry-run
```

**Options:**
- `--dry-run` -- Show what would run without executing.

**Steps (ported from migrate.sh):**

1. Read `.boa/config.json` for `dsqlEndpoint` and `region`.
   Error if missing or if `dsqlEndpoint` is null.
2. Check for `migrations/` directory. Exit cleanly if missing
   or empty:
   `No migrations/ directory found. Nothing to migrate.`
3. Collect and sort `.sql` files alphabetically.
4. Generate DSQL IAM auth token via
   `aws dsql generate-db-connect-admin-auth-token`.
5. Connect to DSQL via `psql` and create the tracking table:
   ```sql
   CREATE TABLE IF NOT EXISTS _boa_migrations (
     name TEXT PRIMARY KEY,
     checksum TEXT NOT NULL,
     applied_at TIMESTAMPTZ DEFAULT NOW()
   )
   ```
6. Load applied migrations (`name|checksum` pairs).
7. For each `.sql` file:
   a. Compute SHA-256 checksum using Node.js `crypto`
      module (eliminates cross-platform `sha256sum` vs
      `shasum` detection from the shell script).
   b. If already applied, verify checksum matches. Error on
      mismatch:
      `[ERROR] <file> -- file modified after being applied`
      `Never edit an applied migration. Write a new migration to fix the issue.`
   c. If not applied, run via `psql -f`.
   d. Record in `_boa_migrations`.
8. If any migrations were applied and `apiUrl` and
   `serviceRoleKey` are in config, refresh PostgREST schema
   cache via `GET <apiUrl>/rest/v1/_refresh`.
9. Print summary: `Migration complete: N applied, M skipped.`

**Validation rules:**
- Modified applied migration is a fatal error (exit 1).
- Failed migration is a fatal error (exit 1) with guidance:
  `Migration failed. Fix the issue and run 'boa migrate' again.`
  `Migrations that were already applied before this run are safe.`

### `boa verify`

Check all stack components are correctly configured.

```
boa verify
```

**Steps (ported from verify.sh):**

1. Read `.boa/config.json`. Error if missing.
2. Print header with stack name and region.
3. Run checks:
   - **Cognito self-signup:** Query
     `aws cognito-idp describe-user-pool` for
     `AllowAdminCreateUserOnly`. Pass if `False`.
   - **API Gateway:** `curl` the API URL. Pass if HTTP 401
     or 403.
   - **S3 bucket exists:** `aws s3api head-bucket`. Pass if
     exists.
   - **S3 bucket private:** `aws s3api get-public-access-block`
     for `BlockPublicAcls`. Pass if `True`.
4. Print results: `Results: N/M checks passed`.
5. Exit 0 if all pass, exit 1 if any fail.

**Example output:**
```
======================================
  BOA Verification
======================================

  Stack:  my-app
  Region: us-east-1

Checking Cognito configuration...
  [PASS] Cognito self-signup enabled (AllowAdminCreateUserOnly=false)
Checking API Gateway...
  [PASS] API returns 401 Unauthorized (not 500)
Checking S3 bucket...
  [PASS] S3 bucket exists
  [PASS] S3 bucket has Block Public Access enabled

======================================
  Results: 4/4 checks passed
  All checks passed
======================================
```

### `boa teardown`

Destroy the entire stack. Requires interactive confirmation
by typing the stack name.

```
boa teardown
```

**Steps (ported from teardown.sh):**

1. Read `.boa/config.json`. Error if missing:
   `Error: .boa/config.json not found. Nothing to tear down.`
2. Print destructive operation warning box listing what will
   be destroyed (database, user accounts, files, Lambda
   functions, API endpoints).
3. Print stack details (name, region, DSQL endpoint, user
   pool ID, bucket name).
4. Prompt: `Type the stack name to confirm deletion [<name>]: `
5. If input does not match stack name, cancel:
   `Teardown cancelled. You typed '<input>' but the stack name is '<name>'.`
6. Disable DSQL deletion protection:
   `aws dsql update-cluster --identifier <cluster-id> --no-deletion-protection-enabled`
7. Disable Cognito deletion protection:
   `aws cognito-idp update-user-pool --user-pool-id <id> --deletion-protection INACTIVE`
8. Empty S3 bucket: `aws s3 rm s3://<bucket> --recursive`.
9. Delete CloudFormation stack: `sam delete --stack-name <name> --no-prompts`.
10. Clean up SSM parameters under `/<stack-name>/`.
11. Remove `.boa/` directory.
12. Print: `Teardown complete. Stack '<name>' has been destroyed.`

**Validation rules:**
- Confirmation must exactly match the stack name.
- The command is interactive -- it reads from stdin. This is
  intentional for safety.

### `boa status`

Show stack information, database tables, and pending
migrations. This is a new command (no script equivalent).

```
boa status
```

**Steps:**

1. Read `.boa/config.json`. Error if missing.
2. Print stack info: name, region, API URL, last deploy time.
3. Generate DSQL auth token and connect via `psql`.
4. Query database tables (using `pg_catalog` for DSQL
   compatibility, same approach as the PostgREST design):
   ```sql
   SELECT c.relname AS tablename
   FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
   ORDER BY c.relname
   ```
5. Query applied migrations:
   ```sql
   SELECT name, applied_at
   FROM _boa_migrations
   ORDER BY name
   ```
6. Scan `migrations/` for pending files (not in
   `_boa_migrations`).
7. Print formatted output.

**Example output:**
```
======================================
  BOA Status
======================================

  Stack:       my-app
  Region:      us-east-1
  API URL:     https://xxx.execute-api.us-east-1.amazonaws.com/prod
  Deployed at: 2026-04-11T12:00:00Z

Tables:
  todos
  _boa_migrations

Applied migrations:
  001_create_todos.sql    2026-04-11 12:05:00Z

Pending migrations:
  (none)
```

### `boa check`

Check required tools and AWS credentials. Prints a clean
checklist.

```
boa check
```

**Steps (ported from check-tools.sh):**

1. Detect platform (macOS / Linux).
2. Check each tool (aws, sam, node, psql, jq) by running its
   version command. Print version or `MISSING`.
3. Check AWS credentials via `aws sts get-caller-identity`.
   Print account ID or `NOT CONFIGURED`.
4. Check default region via `aws configure get region`. Print
   region and note if it's not a DSQL-supported region.
5. If any tools are missing, print platform-specific install
   instructions.
6. Exit 0 if all tools found and credentials valid, exit 1
   otherwise.

**Example output:**
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

**Missing tool output:**
```
Tools:
  aws        2.15.0
  sam        MISSING
  node       20.11.0
  psql       MISSING
  jq         1.7

...

Missing: sam psql
Install:  brew install aws-sam-cli libpq && brew link --force libpq
```

### `boa --version`

Print the CLI version from `package.json`.

```
boa --version
```

Output: `0.1.0` (the version string, nothing else).

This is used by the BOA skill for version sync. The skill
runs `boa --version` to check if the CLI is installed and
what version it is.

## Technical Design

### Entry Point (`bin/boa.mjs`)

```javascript
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const [,, command, ...args] = argv;

if (command === '--version' || command === '-v') {
  const { version } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  console.log(version);
  exit(0);
}

if (command === '--help' || command === '-h' || !command) {
  printHelp();
  exit(0);
}

const commands = {
  init, deploy, migrate, verify, teardown, status, check
};

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  console.error(`Run 'boa --help' for usage.`);
  exit(1);
}

await commands[command](args);
```

No argument parsing framework. Each command receives its
`args` array and parses its own flags. This keeps the
dependency count at zero and the install fast.

### Shell Execution (`lib/aws.mjs`)

Wraps `child_process.execSync` and `child_process.spawnSync`
for calling AWS CLI and SAM CLI. All AWS operations are
delegated to the CLI tools -- the CLI never uses the AWS SDK
directly.

```javascript
import { execSync, spawnSync } from 'node:child_process';

// Run a command and return stdout (for queries)
export function exec(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

// Run a command with inherited stdio (for interactive/long output)
export function run(cmd, opts = {}) {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: 'inherit',
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${cmd}`);
  }
}

// Specific AWS wrappers
export function stsGetCallerIdentity() {
  return JSON.parse(exec('aws sts get-caller-identity'));
}

export function cfnDescribeStacks(stackName, region) {
  const json = exec(
    `aws cloudformation describe-stacks --stack-name ${stackName} --region ${region} --query 'Stacks[0].Outputs' --output json`
  );
  return JSON.parse(json);
}

export function ssmPutParameter(name, value, region) {
  exec(
    `aws ssm put-parameter --name "${name}" --value "${value}" --type String --overwrite --region ${region}`
  );
}

export function dsqlGenerateAuthToken(endpoint, region) {
  return exec(
    `aws dsql generate-db-connect-admin-auth-token --hostname ${endpoint} --region ${region}`
  );
}
```

### SAM Wrapper (`lib/sam.mjs`)

Wraps SAM CLI build and deploy commands.

```javascript
import { run } from './aws.mjs';

export function build(templateFile, buildDir, region) {
  run(`sam build --template-file ${templateFile} --build-dir ${buildDir} --region ${region}`);
}

export function deploy(templateFile, stackName, region) {
  run([
    `sam deploy`,
    `--template-file ${templateFile}`,
    `--stack-name ${stackName}`,
    `--region ${region}`,
    `--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM`,
    `--resolve-s3`,
    `--no-confirm-changeset`,
    `--no-fail-on-empty-changeset`,
    `--parameter-overrides "ProjectName=${stackName}"`,
  ].join(' '));
}

export function remove(stackName, region) {
  run(`sam delete --stack-name ${stackName} --region ${region} --no-prompts`);
}
```

### Config Module (`lib/config.mjs`)

Read and write `.boa/config.json`. Preserves backwards
compatibility with configs written by `bootstrap.sh`.

```javascript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_DIR = '.boa';
const CONFIG_FILE = 'config.json';

export function read(projectDir = process.cwd()) {
  const path = join(projectDir, CONFIG_DIR, CONFIG_FILE);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function write(config, projectDir = process.cwd()) {
  const dir = join(projectDir, CONFIG_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, CONFIG_FILE),
    JSON.stringify(config, null, 2) + '\n'
  );
}

export function requireConfig(projectDir = process.cwd()) {
  const config = read(projectDir);
  if (!config) {
    console.error(
      `Error: .boa/config.json not found. Run 'boa init' first.`
    );
    process.exit(1);
  }
  return config;
}
```

### Key Generation (`lib/keys.mjs`)

Ported from `plugin/scripts/generate-keys.mjs`. Pure Node.js
crypto, no dependencies. Called programmatically by `init`
(not as a child process).

```javascript
import { createHmac } from 'node:crypto';

function sign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now };
  const segments = [
    b64url(JSON.stringify(header)),
    b64url(JSON.stringify(fullPayload)),
  ];
  const sig = createHmac('sha256', secret)
    .update(segments.join('.'))
    .digest('base64url');
  return [...segments, sig].join('.');
}

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

export function generateKeys(secret) {
  const TEN_YEARS = 10 * 365 * 24 * 3600;
  const now = Math.floor(Date.now() / 1000);
  return {
    anonKey: sign(
      { role: 'anon', iss: 'pgrest-lambda', exp: now + TEN_YEARS },
      secret
    ),
    serviceRoleKey: sign(
      { role: 'service_role', iss: 'pgrest-lambda', exp: now + TEN_YEARS },
      secret
    ),
  };
}
```

**Note:** The issuer is `pgrest-lambda` (matching the existing
`generate-keys.mjs`), not `boa`. This is intentional --
pgrest-lambda verifies the issuer in its authorizer.

### Output Module (`lib/output.mjs`)

Clean terminal output helpers for consistent formatting
across all commands.

```javascript
export function ok(msg) {
  console.log(`  [OK] ${msg}`);
}

export function pass(msg) {
  console.log(`  [PASS] ${msg}`);
}

export function fail(msg) {
  console.log(`  [FAIL] ${msg}`);
}

export function skip(msg) {
  console.log(`  [skip] ${msg}`);
}

export function error(msg) {
  console.error(`Error: ${msg}`);
}

export function header(title) {
  console.log('======================================');
  console.log(`  ${title}`);
  console.log('======================================');
}
```

### Template Resolution

The CLI bundles the SAM template and Lambda handlers under
`cli/templates/`. Commands resolve the template path relative
to the CLI package directory:

```javascript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'backend.yaml');
```

The SAM template's `CodeUri` is relative to the template
file. In the plugin, it is `../lambda-templates/`. In the
CLI package, Lambda handlers live in `cli/templates/lambda/`
so `CodeUri` becomes `./lambda/`. This avoids packaging the
SAM YAML file itself into the Lambda deployment zip. Both
`ApiFunction` and `AuthorizerFunction` CodeUri references
are adjusted.

### `psql` Execution for Migrations and Status

Migrations and status use `psql` via shell execution. The
connection string and IAM auth token are constructed the same
way as `migrate.sh`:

```javascript
const token = aws.dsqlGenerateAuthToken(endpoint, region);
const connstr = `host=${endpoint} port=5432 dbname=postgres user=admin sslmode=require`;
// Set PGPASSWORD env var for psql
aws.exec(`psql "${connstr}" -q -c "${sql}"`, {
  env: { ...process.env, PGPASSWORD: token }
});
```

### SHA-256 Checksums

The migration runner needs SHA-256 checksums. Rather than
depending on `sha256sum` or `shasum` (platform-dependent),
the CLI computes checksums natively in Node.js:

```javascript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}
```

This is an improvement over the shell script which needed
cross-platform detection between `sha256sum` and `shasum`.

### Interactive Confirmation (teardown)

The teardown command reads from stdin for confirmation. In
Node.js:

```javascript
import { createInterface } from 'node:readline';

async function confirm(prompt) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
```

### Package Configuration

```json
{
  "name": "boa-cli",
  "version": "0.1.0",
  "description": "CLI for BOA (Backend on AWS) serverless backends",
  "type": "module",
  "bin": {
    "boa": "./bin/boa.mjs"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "bin/",
    "commands/",
    "lib/",
    "templates/"
  ],
  "keywords": ["aws", "serverless", "backend", "cli"],
  "license": "MIT"
}
```

Zero npm dependencies. All functionality uses Node.js
built-ins (`child_process`, `fs`, `path`, `crypto`,
`readline`, `url`).

## Code Architecture / File Changes

### New Files

| File | Purpose |
|------|---------|
| `cli/bin/boa.mjs` | Entry point with shebang, command dispatch |
| `cli/commands/init.mjs` | Port of `bootstrap.sh` + project scaffolding |
| `cli/commands/deploy.mjs` | Port of `deploy.sh` |
| `cli/commands/migrate.mjs` | Port of `migrate.sh` |
| `cli/commands/verify.mjs` | Port of `verify.sh` |
| `cli/commands/teardown.mjs` | Port of `teardown.sh` |
| `cli/commands/status.mjs` | New: stack info + tables + migrations |
| `cli/commands/check.mjs` | Port of `check-tools.sh` |
| `cli/lib/config.mjs` | Read/write `.boa/config.json` |
| `cli/lib/aws.mjs` | Shell wrappers for AWS CLI + SAM CLI |
| `cli/lib/sam.mjs` | SAM build/deploy/delete wrappers |
| `cli/lib/keys.mjs` | JWT key generation (port of `generate-keys.mjs`) |
| `cli/lib/output.mjs` | Terminal output formatting helpers |
| `cli/templates/backend.yaml` | Copy from `plugin/templates/backend.yaml` (CodeUri adjusted to `./lambda/`) |
| `cli/templates/lambda/index.mjs` | Copy from `plugin/lambda-templates/index.mjs` |
| `cli/templates/lambda/authorizer.mjs` | Copy from `plugin/lambda-templates/authorizer.mjs` |
| `cli/templates/lambda/presigned-upload.mjs` | Copy from `plugin/lambda-templates/presigned-upload.mjs` |
| `cli/templates/lambda/package.json` | Copy from `plugin/lambda-templates/package.json` |
| `cli/templates/lambda/package-lock.json` | Copy from `plugin/lambda-templates/package-lock.json` (ensures deterministic SAM builds) |
| `cli/package.json` | npm package manifest |

### Existing Files (No Changes)

| File | Status |
|------|--------|
| `plugin/scripts/*.sh` | Kept as-is. Not removed until the skill is updated (Phase 2). |
| `plugin/scripts/generate-keys.mjs` | Kept as-is. `lib/keys.mjs` is a port, not a move. |
| `plugin/templates/backend.yaml` | Kept as-is. The CLI copy has `CodeUri` adjusted. |
| `plugin/lambda-templates/*.mjs` | Kept as-is. The CLI copies are verbatim. |

### Template CodeUri Adjustment

The only difference between
`plugin/templates/backend.yaml` and
`cli/templates/backend.yaml` is the `CodeUri` property on
the Lambda function resources. In the plugin version:

```yaml
CodeUri: ../lambda-templates/
```

In the CLI version, Lambda handlers are in a `lambda/`
subdirectory under `templates/`:

```yaml
CodeUri: ./lambda/
```

This applies to both `ApiFunction` (line 150 of the
original) and `AuthorizerFunction` (line 128 of the
original). The `lambda/` subdirectory keeps the SAM
template YAML out of the Lambda deployment package.

## Testing Strategy

### Manual Integration Test Plan

The CLI operates against real AWS infrastructure. Testing is
manual, following the same approach as the current scripts.
Run these from a clean directory:

1. **`npm link`** -- Install the CLI globally from the
   `cli/` directory.
2. **`boa --version`** -- Prints version string.
3. **`boa check`** -- All tools listed with versions, AWS
   credentials show account ID, region is shown.
4. **`boa check` with missing tool** -- Uninstall or hide a
   tool (e.g., `alias psql=false`), verify it shows MISSING
   and prints install instructions. Exit code 1.
5. **`boa init test-app --region us-east-1`** -- Creates
   `test-app/` directory with `migrations/`, `policies/`,
   `.boa/`, `.gitignore`. Deploys stack. Writes
   `.boa/config.json` with all expected fields. Print
   summary with API URL and keys.
6. **`boa init` (no name)** -- Uses current directory name
   as stack name. Verify behavior.
7. **`boa init bad_name`** -- Rejects name with underscore.
   Prints validation error.
8. **`boa verify`** -- All 4 checks pass (Cognito, API 401,
   S3 exists, S3 private).
9. **`boa status`** -- Shows stack info. Tables section shows
   only `_boa_migrations` (or empty if no migrations run).
   No pending migrations.
10. **Create migration** -- Write
    `migrations/001_create_todos.sql` with a CREATE TABLE
    statement.
11. **`boa migrate`** -- Applies the migration. Shows
    `1 applied, 0 skipped`.
12. **`boa migrate`** (again) -- Shows `0 applied, 1 skipped`.
13. **`boa migrate --dry-run`** -- Shows what would run
    without executing.
14. **Edit the applied migration** -- Modify the `.sql` file.
    Run `boa migrate`. Error: checksum mismatch.
15. **`boa status`** -- Shows `todos` and `_boa_migrations`
    in tables. Shows `001_create_todos.sql` in applied
    migrations. No pending.
16. **`boa deploy`** -- Rebuilds and redeploys. Config is
    updated with fresh `deployedAt`. Keys are preserved.
17. **`boa verify`** -- All checks still pass after redeploy.
18. **`boa teardown`** -- Shows warning, prompts for stack
    name. Type wrong name: cancelled. Type correct name:
    disables deletion protection, empties S3, deletes stack,
    cleans SSM, removes `.boa/`.
19. **`boa deploy` after teardown** -- Error: config not
    found.
20. **Config compatibility** -- Create a `.boa/config.json`
    using the old `bootstrap.sh`, then run `boa deploy`.
    Verify it reads the existing config and deploys
    successfully.

### Unit-Testable Logic

While the CLI primarily shells out to external tools, these
modules contain pure logic that can be unit tested:

**lib/keys.mjs:**
- `generateKeys(secret)` returns `{ anonKey, serviceRoleKey }`.
- Both keys decode to valid JWT structure.
- `anonKey` has `role: 'anon'`, `iss: 'pgrest-lambda'`.
- `serviceRoleKey` has `role: 'service_role'`,
  `iss: 'pgrest-lambda'`.
- Both have ~10-year expiry.

**lib/config.mjs:**
- `read()` returns null for missing file.
- `read()` returns parsed JSON for valid file.
- `write()` creates `.boa/` directory and writes JSON.
- `requireConfig()` calls `process.exit(1)` when config
  missing.
- Round-trip: `write(config)` then `read()` returns same
  config.

**SHA-256 checksum (in migrate command):**
- Produces correct hex digest for known input.
- Matches output of `sha256sum` on the same file.

**Stack name validation (in init command):**
- Accepts `my-app`, `test123`, `a`.
- Rejects `My_App`, `test app`, `test@app`, empty string.

## Implementation Order

### Phase 1: Package Skeleton and Library Modules

1. Create `cli/` directory structure.
2. Create `cli/package.json`.
3. Implement `lib/output.mjs` -- terminal formatting.
4. Implement `lib/config.mjs` -- config read/write.
5. Implement `lib/keys.mjs` -- port `generate-keys.mjs`.
6. Implement `lib/aws.mjs` -- shell execution wrappers.
7. Implement `lib/sam.mjs` -- SAM CLI wrappers.
8. Create `bin/boa.mjs` -- entry point with command dispatch,
   `--version`, `--help`.

### Phase 2: Copy Templates

9. Copy `plugin/templates/backend.yaml` to
   `cli/templates/backend.yaml` and adjust both `CodeUri`
   references to `./lambda/`.
10. Copy `plugin/lambda-templates/index.mjs`,
    `authorizer.mjs`, `presigned-upload.mjs`,
    `package.json`, and `package-lock.json` to
    `cli/templates/lambda/`.

### Phase 3: Core Commands

11. Implement `commands/check.mjs` -- port `check-tools.sh`.
12. Implement `commands/init.mjs` -- port `bootstrap.sh` plus
    project scaffolding.
13. Implement `commands/deploy.mjs` -- port `deploy.sh`.
14. Implement `commands/migrate.mjs` -- port `migrate.sh`.

### Phase 4: Remaining Commands

15. Implement `commands/verify.mjs` -- port `verify.sh`.
16. Implement `commands/teardown.mjs` -- port `teardown.sh`.
17. Implement `commands/status.mjs` -- new command.

### Phase 5: End-to-End Validation

18. `npm link` and run the full manual test plan.
19. Verify config compatibility with existing
    `bootstrap.sh`-generated configs.

## Open Questions

1. **Template synchronization.** The CLI bundles a copy of the
   SAM template and Lambda handlers. When the plugin's
   templates change (e.g., new resource, updated handler),
   the CLI copies must be updated too. A CI check or script
   should verify the CLI templates stay in sync with the
   plugin originals (ignoring the `CodeUri` adjustment).

2. **Phase 2 skill migration.** When the skill is updated to
   use `boa` commands instead of script paths, the scripts
   in `plugin/scripts/` can be removed and the templates in
   `plugin/templates/` can be made secondary. This design
   covers only Phase 1 (build the CLI). Phase 2 (update the
   skill) and Phase 3 (skill auto-install) are separate
   designs.

3. **`--dry-run` for migrate.** The current `migrate.sh` does
   not support `--dry-run`. Adding it is straightforward
   (list pending files without executing) but is new
   behavior. Include it in Phase 1 or defer?

4. **`boa status` database connectivity.** The status command
   connects to DSQL to list tables and migrations. If the
   database is unreachable (e.g., credentials expired), it
   should degrade gracefully -- show stack info from config
   and note that database info is unavailable, rather than
   failing entirely.

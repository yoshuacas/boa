import { randomBytes } from 'node:crypto';
import {
  existsSync, mkdirSync, readdirSync, cpSync, writeFileSync,
} from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as aws from '../lib/aws.mjs';
import * as sam from '../lib/sam.mjs';
import * as config from '../lib/config.mjs';
import { generateKeys } from '../lib/keys.mjs';
import { ok, header } from '../lib/output.mjs';
import {
  TOOLS, DSQL_REGIONS, getOutputValue, REPO_URL,
} from '../lib/constants.mjs';
import { copySkill } from '../lib/skill.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = process.env.BOA_TEMPLATE_OVERRIDE
  || join(__dirname, '..', 'templates', 'backend.yaml');

export function validateStackName(name) {
  if (name.length === 1) return /^[a-z0-9]$/.test(name);
  return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(name);
}

export function validateRegion(region) {
  return DSQL_REGIONS.includes(region);
}

function extractVersion(output) {
  const match = output.match(/(\d+\.\d+(\.\d+)?)/);
  return match ? match[1] : 'installed';
}

function parseArgs(args) {
  let name = null;
  let region = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && i + 1 < args.length) {
      region = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--') && name === null) {
      name = args[i];
    }
  }

  return { name, region };
}

function generateClaudeMd(stackName, cfg) {
  return `# BOA Backend — ${stackName}

This project has a BOA backend deployed on AWS. Use the \`boa\` CLI for all backend operations.

## Full Skill Reference

The complete BOA skill and docs are bundled locally in \`.boa/skill/\`. Load these on demand when you need detailed patterns:

- **Skill**: .boa/skill/SKILL.md — Full skill instructions (start here)
- **REST API**: .boa/skill/docs/REST-API.md
- **Access Policies**: .boa/skill/docs/POLICIES.md
- **Auth Patterns**: .boa/skill/docs/AUTH-PATTERNS.md
- **DSQL Patterns**: .boa/skill/docs/DSQL-PATTERNS.md
- **Migrations**: .boa/skill/docs/MIGRATIONS.md
- **Storage**: .boa/skill/docs/STORAGE-PATTERNS.md
- **Functions**: .boa/skill/docs/FUNCTIONS.md
- **Architecture**: .boa/skill/docs/ARCHITECTURE.md
- **Pitfalls**: .boa/skill/docs/PITFALLS.md

These are updated whenever you run \`boa deploy\`.

## Communication Style

You are a confident backend engineer pair-programming with the developer.
- **Narrate, don't dump.** Before running a command, explain what you're doing in one plain sentence. After it finishes, summarize the outcome.
- **Use the developer's language.** Say "creating your database" not "provisioning an Aurora DSQL cluster."
- **Hide backend plumbing.** Show outcomes, not IAM tokens or CloudFormation IDs.
- **Be brief and direct.** One sentence before an action, one sentence after.
- **When something fails, explain the fix — not the internals.**
- **Never open HTML via \`file://\`.** Always start a local dev server (\`npx vite\`, \`npx serve\`).

## Architecture

\`\`\`
Client App (React/Next.js/Vue)  ──  @supabase/supabase-js (drop-in client)
    │
    ▼
ALB + WAF (DDoS protection, rate limiting)
    │
    ▼
Lambda (direct invoke) ─── pgrest-lambda engine (handles JWT + CORS + routing)
    │
    ├──▶ Aurora DSQL ─── PostgreSQL (PostgREST-compatible REST API)
    ├──▶ Amazon S3 ─── File storage (presigned URLs only)
    └──▶ Cognito ─── User management (GoTrue-compatible auth)
\`\`\`

Everything is serverless. No servers to manage. Scales to zero, scales to millions.

The REST API and auth engine are provided by [\`pgrest-lambda\`](${REPO_URL.replace('boa', 'pgrest-lambda')}) — an npm library that introspects your database schema at runtime and auto-generates a full PostgREST-compatible REST API with GoTrue-compatible auth. \`@supabase/supabase-js\` works as a drop-in client.

## BOA CLI

All operations go through the \`boa\` CLI. The developer can also run these commands directly.

| Command | What it does |
|---------|-------------|
| \`boa deploy\` | Rebuild + redeploy (SAM build/deploy, bundle policies) |
| \`boa migrate\` | Apply pending SQL migrations to DSQL |
| \`boa verify\` | Check all backend components are correct |
| \`boa status\` | Show backend info, tables, pending migrations |
| \`boa check\` | Check required tools + AWS credentials |
| \`boa extend <name>\` | Add an optional extension (e.g., api-gateway) |
| \`boa remove <name>\` | Remove an extension |
| \`boa teardown\` | Destroy everything (with confirmation) |

## Critical Rules

These come from hundreds of real AI-built backends. Every rule prevents a real failure.

1. **Cognito self-sign-up**: Always set \`AllowAdminCreateUserOnly: false\`
2. **Pre-signup trigger**: Always deploy a Lambda that auto-confirms users
3. **Lambda runtime**: Always Node.js 20.x — never Python (binary dependency failures)
4. **Reserved env vars**: Never set \`AWS_REGION\` as Lambda env var — use \`REGION_NAME\`
5. **S3 security**: Never make buckets public — always use presigned URLs
6. **Vite polyfill**: Always add \`global: 'globalThis'\` in Vite config for Cognito SDK
7. **Amplify redirects**: Never use \`/<*>\` as SPA redirect — use regex excluding static assets
8. **DSQL auth**: Always use IAM authentication tokens — never hardcode credentials
9. **Access policies required with tables**: When creating tables, always write access policies too — tables without policies return 403 on all requests
10. **Never tear down to fix a problem**: Diagnose and fix the specific issue. \`boa teardown\` destroys the database, user accounts, and uploaded files — all irreplaceable.
11. **Deletion protection on stateful resources**: DSQL cluster, Cognito user pool, and S3 bucket have \`DeletionPolicy: Retain\`. Never disable these protections.
12. **Extensions are optional**: The default backend works without any extensions.

## Adding Tables and Policies

### Write migrations in \`migrations/\`

**DSQL constraints:**
- No \`REFERENCES\` (foreign keys) — document relationships in comments
- No \`SERIAL\` / \`BIGSERIAL\` — use \`TEXT DEFAULT gen_random_uuid()::text\`
- \`CREATE INDEX ASYNC\` — DSQL requires ASYNC for all index creation
- No triggers, stored procedures, or functions
- Name foreign key columns with \`_id\` suffix for automatic resource embedding

\`\`\`sql
-- migrations/001_create_todos.sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,  -- references users(id)
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

### Write access policies in \`policies/\`

**Every table needs an access policy.** Without one, all requests return 403.

\`\`\`cedar
// policies/default.cedar — standard ownership-based access
permit(
    principal is PgrestLambda::User,
    action in [PgrestLambda::Action::"select", PgrestLambda::Action::"update", PgrestLambda::Action::"delete"],
    resource is PgrestLambda::Row
) when { resource has user_id && resource.user_id == principal };

permit(principal is PgrestLambda::User, action == PgrestLambda::Action::"insert", resource is PgrestLambda::Table);
permit(principal is PgrestLambda::ServiceRole, action, resource);
\`\`\`

### Deploy changes

\`\`\`bash
boa deploy    # bundles policies into Lambda and applies pending migrations
\`\`\`

## REST API

Every table is automatically available after deploying migrations:

\`\`\`
GET    /rest/v1/<table>                — list rows (with filtering, ordering, pagination)
POST   /rest/v1/<table>                — insert rows
PATCH  /rest/v1/<table>?id=eq.<value>  — update rows
DELETE /rest/v1/<table>?id=eq.<value>  — delete rows
\`\`\`

All requests require an \`apikey\` header. Authenticated requests also include \`Authorization: Bearer <token>\`.

**Resource embedding** — fetch related data in one request using \`select\` with parentheses (works automatically with \`_id\` columns):

\`\`\`javascript
const { data } = await supabase
  .from('games')
  .select('*, game_stats(goals, assists, players(name, position))');
\`\`\`

## Authentication

Auth endpoints work immediately — no tables or policies needed.

\`\`\`
POST /auth/v1/signup                         — sign up
POST /auth/v1/token?grant_type=password      — sign in
POST /auth/v1/token?grant_type=refresh_token — refresh
GET  /auth/v1/user                           — current user
POST /auth/v1/logout                         — sign out
\`\`\`

## Frontend Configuration

\`\`\`bash
npm install @supabase/supabase-js
\`\`\`

\`\`\`javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  '${cfg.apiUrl}',
  '${cfg.anonKey}'
);

// Auth
await supabase.auth.signUp({ email, password });
await supabase.auth.signInWithPassword({ email, password });

// Data
const { data } = await supabase.from('todos').select('*');
await supabase.from('todos').insert({ title: 'Buy milk', user_id: userId });
\`\`\`

For Vite: add \`define: { global: 'globalThis' }\` to \`vite.config.js\` (required for Cognito SDK).

## Configuration

Backend configuration is in \`.boa/config.json\`:
- **apiUrl**: ${cfg.apiUrl} (ALB endpoint, primary entry point)
- **alb**: Load balancer ARN, DNS name, target group ARN, VPC ID
- **anonKey**: Public key for client-side access
- **serviceRoleKey**: Admin key (server-side only, bypasses authorization)
- **userPoolId**: ${cfg.userPoolId}
- **bucketName**: ${cfg.bucketName}
- **dsqlEndpoint**: ${cfg.dsqlEndpoint}
- **region**: ${cfg.region}

## Repository

BOA source, templates, and docs: ${REPO_URL}
`;
}

export default async function init(args) {
  const parsed = parseArgs(args);
  let name = parsed.name || basename(process.cwd());
  const regionFlag = parsed.region;

  // 1. Check prerequisites
  console.log('Checking prerequisites...');
  for (const { name: toolName, cmd } of TOOLS) {
    try {
      const output = aws.exec(cmd);
      const version = extractVersion(output);
      ok(`${toolName} ${version}`);
    } catch {
      console.error(`Error: ${toolName} is not installed.`);
      process.exit(1);
    }
  }

  console.log('');

  // 2. Check AWS credentials
  console.log('Verifying AWS credentials...');
  let accountId;
  try {
    const identity = aws.stsGetCallerIdentity();
    accountId = identity.Account;
    ok(`Authenticated as account ${accountId}`);
  } catch {
    console.error(
      'Error: AWS credentials are not configured or are invalid.'
    );
    console.error("Run 'aws configure' or 'aws sso login' first.");
    process.exit(1);
  }

  // 3. Resolve and validate region
  let region = regionFlag;
  if (!region) {
    try {
      region = aws.exec('aws configure get region');
    } catch {
      console.error(
        'Error: No region specified and none found in AWS config.'
      );
      console.error(
        "Use --region <region> or run 'aws configure' first."
      );
      process.exit(1);
    }
  }

  if (!validateRegion(region)) {
    console.error(
      `Error: Aurora DSQL requires us-east-1 or us-east-2. Got: ${region}`
    );
    process.exit(1);
  }
  ok(`Region: ${region}`);
  console.log('');

  // 4. Validate stack name
  if (!validateStackName(name)) {
    console.error(
      'Error: Stack name must contain only lowercase letters,' +
      ' numbers, and hyphens.'
    );
    process.exit(1);
  }

  // 5. Create project directory if name was provided
  if (parsed.name) {
    mkdirSync(parsed.name, { recursive: true });
    process.chdir(parsed.name);
  }

  // 6. Scaffold directories and .gitignore
  mkdirSync('migrations', { recursive: true });
  mkdirSync('policies', { recursive: true });
  mkdirSync('.boa', { recursive: true });
  if (!existsSync('.gitignore')) {
    writeFileSync('.gitignore', '.boa/\nnode_modules/\n');
  }

  // 7. Generate JWT secret
  console.log('Generating secrets...');
  const jwtSecret = randomBytes(32).toString('base64');

  // 8. Store in SSM
  aws.ssmPutParameter(`/${name}/jwt-secret`, jwtSecret, region);
  ok(`JWT secret stored at /${name}/jwt-secret`);
  console.log('');

  // 9. SAM build
  console.log('Building SAM application...');
  const buildDir = join(process.cwd(), '.boa', '.aws-sam', 'build');
  sam.build(TEMPLATE_PATH, buildDir, region);

  // 10. Copy Cedar policies if present
  const policiesDir = join(process.cwd(), 'policies');
  if (existsSync(policiesDir)) {
    const policyFiles = readdirSync(policiesDir);
    if (policyFiles.length > 0) {
      const dest = join(buildDir, 'ApiFunction', 'policies');
      cpSync(policiesDir, dest, { recursive: true });
    }
  }

  console.log('');

  // 11. SAM deploy
  console.log(`Deploying stack '${name}' to ${region}...`);
  const builtTemplate = join(buildDir, 'template.yaml');
  sam.deploy(builtTemplate, name, region);

  // 12. Extract CloudFormation outputs
  console.log('');
  console.log('Extracting stack outputs...');
  const outputs = aws.cfnDescribeStacks(name, region);
  const albUrl = getOutputValue(outputs, 'AlbUrl');
  const albArn = getOutputValue(outputs, 'AlbArn');
  const targetGroupArn = getOutputValue(outputs, 'TargetGroupArn');
  const vpcId = getOutputValue(outputs, 'VpcId');
  const userPoolId = getOutputValue(outputs, 'UserPoolId');
  const userPoolClientId = getOutputValue(
    outputs, 'UserPoolClientId'
  );
  const bucketName = getOutputValue(outputs, 'BucketName');
  const dsqlEndpoint = getOutputValue(outputs, 'DsqlEndpoint');

  // apiUrl is the ALB endpoint (primary entry point)
  const apiUrl = albUrl;

  // 12b. Force Cognito self-signup (corp accounts may override this)
  const preSignUpArn = aws.exec(
    `aws lambda get-function --function-name ${name}-pre-signup`
      + ` --region ${region}`
      + ` --query 'Configuration.FunctionArn' --output text`
  );
  aws.run(
    `aws cognito-idp update-user-pool`
      + ` --user-pool-id ${userPoolId} --region ${region}`
      + ` --admin-create-user-config AllowAdminCreateUserOnly=false`
      + ` --lambda-config PreSignUp=${preSignUpArn}`
      + ` --auto-verified-attributes email`
  );
  ok('Cognito self-signup enforced');

  // 13. Generate keys
  console.log('Generating BOA keys...');
  const { anonKey, serviceRoleKey } = generateKeys(jwtSecret);
  ok('Anon key and service role key generated');

  // 14. Write config
  config.write({
    stackName: name,
    region,
    accountId,
    apiUrl,
    alb: albArn ? {
      arn: albArn,
      dnsName: new URL(apiUrl).hostname,
      targetGroupArn,
      vpcId,
    } : undefined,
    anonKey,
    serviceRoleKey,
    userPoolId,
    userPoolClientId,
    bucketName,
    dsqlEndpoint,
    deployedAt: new Date().toISOString(),
    extensions: [],
  });
  console.log('');
  console.log('Configuration written to .boa/config.json');

  // 15. Run migrations if any .sql files exist
  const migrationsDir = join(process.cwd(), 'migrations');
  if (existsSync(migrationsDir)) {
    const sqlFiles = readdirSync(migrationsDir).filter(
      (f) => f.endsWith('.sql')
    );
    if (sqlFiles.length > 0) {
      console.log('');
      console.log('Running database migrations...');
      const migrate = await import('./migrate.mjs');
      await migrate.default([]);
    }
  }

  // 16. Bundle skill and docs into .boa/skill/
  copySkill(process.cwd());
  ok('Skill and docs bundled in .boa/skill/');

  // 17. Write CLAUDE.md for Claude Code skill discovery
  if (!existsSync('CLAUDE.md')) {
    writeFileSync('CLAUDE.md', generateClaudeMd(name, {
      apiUrl, anonKey, serviceRoleKey, userPoolId,
      userPoolClientId, bucketName, dsqlEndpoint, region,
    }));
    ok('CLAUDE.md written (Claude Code will load the BOA skill automatically)');
  }

  // 18. Write .claude/settings.json for auto-approved tools
  const claudeSettingsDir = join(process.cwd(), '.claude');
  const claudeSettingsPath = join(claudeSettingsDir, 'settings.json');
  if (!existsSync(claudeSettingsPath)) {
    mkdirSync(claudeSettingsDir, { recursive: true });
    writeFileSync(claudeSettingsPath, JSON.stringify({
      permissions: {
        allow: [
          'Bash(boa *)',
          'Bash(npm install*)',
          'Bash(npx vite*)',
          'Bash(npx serve*)',
        ],
      },
    }, null, 2) + '\n');
    ok('.claude/settings.json written (boa commands auto-approved)');
  }

  // 19. Print summary
  console.log('');
  header('BOA deployment complete');
  console.log('');
  console.log(`  API URL:      ${apiUrl}`);
  console.log(`  Anon Key:         ${anonKey.slice(0, 20)}...`);
  console.log(
    `  Service Role Key: ${serviceRoleKey.slice(0, 20)}...`
  );
  console.log(`  User Pool ID:     ${userPoolId}`);
  console.log(`  Client ID:        ${userPoolClientId}`);
  console.log(`  S3 Bucket:        ${bucketName}`);
  console.log(`  DSQL Endpoint:    ${dsqlEndpoint}`);
  console.log('');
  console.log(`  API Docs:     ${apiUrl}/rest/v1/_docs`);
  console.log(
    '  Your API documentation is live. Add tables and policies, then'
  );
  console.log(
    '  run `boa deploy` to see your endpoints in the docs.'
  );
}

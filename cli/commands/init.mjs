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

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'backend.yaml');

const DSQL_REGIONS = ['us-east-1', 'us-east-2'];

const TOOLS = [
  { name: 'aws',  cmd: 'aws --version' },
  { name: 'sam',  cmd: 'sam --version' },
  { name: 'node', cmd: 'node --version' },
  { name: 'psql', cmd: 'psql --version' },
  { name: 'jq',   cmd: 'jq --version' },
];

export function validateStackName(name) {
  return /^[a-z0-9-]+$/.test(name);
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

function getOutputValue(outputs, key) {
  const entry = outputs.find((o) => o.OutputKey === key);
  return entry ? entry.OutputValue : null;
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
  if (parsed.name && !existsSync(parsed.name)) {
    mkdirSync(parsed.name, { recursive: true });
    process.chdir(parsed.name);
  }

  // 6. Scaffold directories and .gitignore
  mkdirSync('migrations', { recursive: true });
  mkdirSync('policies', { recursive: true });
  mkdirSync('.boa', { recursive: true });
  writeFileSync('.gitignore', '.boa/\nnode_modules/\n');

  // 7. Generate JWT secret
  console.log('Generating JWT secret...');
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
  const apiUrl = getOutputValue(outputs, 'ApiUrl');
  const userPoolId = getOutputValue(outputs, 'UserPoolId');
  const userPoolClientId = getOutputValue(
    outputs, 'UserPoolClientId'
  );
  const bucketName = getOutputValue(outputs, 'BucketName');
  const dsqlEndpoint = getOutputValue(outputs, 'DsqlEndpoint');

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
    anonKey,
    serviceRoleKey,
    userPoolId,
    userPoolClientId,
    bucketName,
    dsqlEndpoint,
    deployedAt: new Date().toISOString(),
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

  // 16. Print summary
  console.log('');
  header('BOA deployment complete');
  console.log('');
  console.log(`  API URL:          ${apiUrl}`);
  console.log(`  Anon Key:         ${anonKey.slice(0, 20)}...`);
  console.log(
    `  Service Role Key: ${serviceRoleKey.slice(0, 20)}...`
  );
  console.log(`  User Pool ID:     ${userPoolId}`);
  console.log(`  Client ID:        ${userPoolClientId}`);
  console.log(`  S3 Bucket:        ${bucketName}`);
  console.log(`  DSQL Endpoint:    ${dsqlEndpoint}`);
}

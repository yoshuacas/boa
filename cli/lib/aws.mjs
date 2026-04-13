import { execSync, spawnSync } from 'node:child_process';

// Shell-escape a value to prevent command injection.
// Wraps in single quotes and escapes any embedded single quotes.
export function shellEscape(val) {
  return "'" + String(val).replace(/'/g, "'\\''") + "'";
}

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

// Specific AWS wrappers — all parameters are shell-escaped
export function stsGetCallerIdentity() {
  return JSON.parse(exec('aws sts get-caller-identity'));
}

export function cfnDescribeStacks(stackName, region) {
  const json = exec(
    `aws cloudformation describe-stacks --stack-name ${shellEscape(stackName)} --region ${shellEscape(region)} --query 'Stacks[0].Outputs' --output json`
  );
  return JSON.parse(json);
}

export function ssmPutParameter(name, value, region) {
  exec(
    `aws ssm put-parameter --name ${shellEscape(name)} --value ${shellEscape(value)} --type String --overwrite --region ${shellEscape(region)}`
  );
}

export function dsqlGenerateAuthToken(endpoint, region) {
  return exec(
    `aws dsql generate-db-connect-admin-auth-token --hostname ${shellEscape(endpoint)} --region ${shellEscape(region)}`
  );
}

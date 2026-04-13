import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import * as aws from '../lib/aws.mjs';
import * as sam from '../lib/sam.mjs';
import * as config from '../lib/config.mjs';
import { ok } from '../lib/output.mjs';

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

export default async function teardown(_args) {
  // 1. Load config with teardown-specific error message
  const cfg = config.read();
  if (!cfg) {
    console.error(
      'Error: .boa/config.json not found. Nothing to tear down.'
    );
    process.exit(1);
  }

  // 2. Read config values
  const { stackName, region, bucketName, userPoolId, dsqlEndpoint } =
    cfg;

  // 3. Print destructive operation warning box
  console.log('');
  console.log(
    '╔══════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║                    DESTRUCTIVE OPERATION                    ║'
  );
  console.log(
    '╠══════════════════════════════════════════════════════════════╣'
  );
  console.log(
    '║  This will PERMANENTLY DESTROY:                             ║'
  );
  console.log(
    '║    • All database tables and data (Aurora DSQL)             ║'
  );
  console.log(
    '║    • All user accounts (Cognito)                            ║'
  );
  console.log(
    '║    • All uploaded files (S3)                                ║'
  );
  console.log(
    '║    • All Lambda functions and API endpoints                 ║'
  );
  console.log(
    '║                                                             ║'
  );
  console.log(
    '║  This CANNOT be undone.                                     ║'
  );
  console.log(
    '║                                                             ║'
  );
  console.log(
    '║  If you\'re trying to FIX a problem, stop here.             ║'
  );
  console.log(
    '║  Use deploy.sh to redeploy, or debug the specific issue.   ║'
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════╝'
  );

  // 4. Print stack details
  console.log('');
  console.log(`  Stack:     ${stackName}`);
  console.log(`  Region:    ${region}`);
  console.log(`  Database:  ${dsqlEndpoint}`);
  console.log(`  Users:     ${userPoolId}`);
  console.log(`  Storage:   ${bucketName}`);
  console.log('');

  // 5. Prompt for confirmation
  const answer = await confirm(
    `Type the stack name to confirm deletion [${stackName}]: `
  );

  // 6. Verify confirmation
  if (answer !== stackName) {
    console.log(
      `Teardown cancelled. You typed '${answer}' but the stack name is '${stackName}'.`
    );
    process.exit(0);
  }

  console.log('');

  // 7. Disable DSQL deletion protection
  console.log(
    'Disabling deletion protection on stateful resources...'
  );
  const dsqlClusterId = dsqlEndpoint.split('.')[0];
  try {
    aws.exec(
      `aws dsql update-cluster --identifier ${dsqlClusterId}` +
        ` --no-deletion-protection-enabled --region ${region}`
    );
  } catch {
    // Ignore errors
  }
  ok('DSQL deletion protection disabled');

  // 8. Disable Cognito deletion protection
  try {
    aws.exec(
      `aws cognito-idp update-user-pool --user-pool-id ${userPoolId}` +
        ` --deletion-protection INACTIVE --region ${region}`
    );
  } catch {
    // Ignore errors
  }
  ok('Cognito deletion protection disabled');

  // 9. Empty S3 bucket
  console.log('');
  console.log(`Emptying S3 bucket '${bucketName}'...`);
  try {
    aws.run(
      `aws s3 rm s3://${bucketName} --recursive --region ${region}`
    );
  } catch {
    // Ignore errors
  }
  ok('Bucket emptied');

  // 10. Delete CloudFormation stack
  console.log('');
  console.log(`Deleting CloudFormation stack '${stackName}'...`);
  sam.remove(stackName, region);
  ok('Stack deleted');

  // 11. Clean up SSM parameters
  console.log('');
  console.log('Cleaning up SSM parameters...');
  try {
    const json = aws.exec(
      `aws ssm get-parameters-by-path --path /${stackName}/` +
        ` --region ${region} --query 'Parameters[*].Name'` +
        ` --output json`
    );
    const params = JSON.parse(json);
    for (const param of params) {
      try {
        aws.exec(
          `aws ssm delete-parameter --name "${param}"` +
            ` --region ${region}`
        );
      } catch {
        // Ignore errors
      }
    }
  } catch {
    // Ignore errors (no parameters found)
  }
  ok('SSM parameters removed');

  // 12. Remove .boa/ directory
  console.log('');
  console.log('Removing .boa/...');
  rmSync(join(process.cwd(), '.boa'), {
    recursive: true,
    force: true,
  });
  ok('Local configuration removed');

  // 13. Print completion message
  console.log('');
  console.log(
    `Teardown complete. Stack '${stackName}' has been destroyed.`
  );
}

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import * as aws from '../lib/aws.mjs';
import { shellEscape } from '../lib/aws.mjs';
import * as deployLib from '../lib/deploy.mjs';
import * as config from '../lib/config.mjs';
import * as amplify from '../lib/amplify.mjs';
import { ok, fail } from '../lib/output.mjs';

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
  if (!process.stdin.isTTY) {
    console.error(
      'Error: boa teardown must be run interactively'
        + ' from a terminal.\n'
    );
    console.error(
      'Teardown is a destructive operation that requires'
        + ' human confirmation.'
    );
    console.error(
      'It cannot be run from scripts, pipes, or automated'
        + ' tools.'
    );
    process.exit(1);
  }

  // 1. Load config with teardown-specific error message
  const cfg = config.read();
  if (!cfg) {
    console.error(
      'Error: .boa/config.json not found. Nothing to tear down.'
    );
    process.exit(1);
  }

  // 2. Read config values
  const {
    stackName, region, bucketName, userPoolId, dsqlEndpoint,
    authProvider = userPoolId ? 'cognito' : 'better-auth',
  } = cfg;

  // 3. Print destructive operation warning box. Inner width is 62 chars;
  //    row() pads content to that width so the right-side rail aligns.
  const BOX_WIDTH = 62;
  const row = (text) => `║${text.padEnd(BOX_WIDTH, ' ')}║`;
  const hr = (left, right) => `${left}${'═'.repeat(BOX_WIDTH)}${right}`;
  const center = (text) => {
    const pad = Math.max(0, BOX_WIDTH - text.length);
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + text + ' '.repeat(pad - left);
  };

  console.log('');
  console.log(hr('╔', '╗'));
  console.log(row(center('DESTRUCTIVE OPERATION')));
  console.log(hr('╠', '╣'));
  console.log(row('  This will PERMANENTLY DESTROY:'));
  console.log(row('    • All database tables and data (Aurora DSQL)'));
  console.log(row('    • All user accounts'));
  console.log(row('    • All uploaded files (S3)'));
  console.log(row('    • All Lambda functions and API endpoints'));
  console.log(row(''));
  console.log(row('  This CANNOT be undone.'));
  console.log(row(''));
  console.log(row('  If you\'re trying to FIX a problem, stop here.'));
  console.log(row('  Use `boa deploy` to redeploy, or debug the issue.'));
  console.log(hr('╚', '╝'));

  // 4. Print stack details
  console.log('');
  console.log(`  Stack:     ${stackName}`);
  console.log(`  Region:    ${region}`);
  console.log(`  Database:  ${dsqlEndpoint}`);
  console.log(`  Auth:      ${authProvider}`);
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
      `aws dsql update-cluster --identifier ${shellEscape(dsqlClusterId)}` +
        ` --no-deletion-protection-enabled --region ${shellEscape(region)}`
    );
  } catch {
    // Ignore errors
  }
  ok('DSQL deletion protection disabled');

  // 8. Disable Cognito deletion protection for legacy backends
  if (userPoolId) {
    try {
      aws.exec(
        `aws cognito-idp update-user-pool --user-pool-id ${shellEscape(userPoolId)}` +
          ` --deletion-protection INACTIVE --region ${shellEscape(region)}`
      );
    } catch {
      // Ignore errors
    }
    ok('Cognito deletion protection disabled');
  }

  // 9. Empty S3 bucket
  console.log('');
  console.log(`Emptying S3 bucket '${bucketName}'...`);
  try {
    aws.run(
      `aws s3 rm s3://${shellEscape(bucketName)} --recursive --region ${shellEscape(region)}`
    );
  } catch {
    // Ignore errors
  }
  ok('Bucket emptied');

  // 10. Delete CloudFormation stack
  console.log('');
  console.log(`Deleting CloudFormation stack '${stackName}'...`);
  await deployLib.deleteStack(stackName, region);
  ok('Stack deleted');

  // 11-13. Delete retained resources
  console.log('');
  console.log('Deleting retained resources...');

  try {
    aws.exec(
      `aws dsql delete-cluster`
        + ` --identifier ${shellEscape(dsqlClusterId)}`
        + ` --region ${shellEscape(region)}`
    );
    ok(`DSQL cluster '${dsqlClusterId}' delete initiated`);
  } catch (e) {
    if (e.message?.includes('ResourceNotFoundException')) {
      ok(`DSQL cluster '${dsqlClusterId}' already gone`);
    } else {
      fail(`DSQL cluster '${dsqlClusterId}' delete failed:`
        + ` ${e.message}`);
    }
  }

  if (userPoolId) {
    try {
      aws.exec(
        `aws cognito-idp delete-user-pool`
          + ` --user-pool-id ${shellEscape(userPoolId)}`
          + ` --region ${shellEscape(region)}`
      );
      ok(`Cognito user pool '${userPoolId}' deleted`);
    } catch (e) {
      if (e.message?.includes('ResourceNotFoundException')) {
        ok(`Cognito user pool '${userPoolId}' already gone`);
      } else {
        fail(`Cognito user pool '${userPoolId}' delete failed:`
          + ` ${e.message}`);
      }
    }
  }

  try {
    aws.exec(
      `aws s3api delete-bucket`
        + ` --bucket ${shellEscape(bucketName)}`
        + ` --region ${shellEscape(region)}`
    );
    ok(`S3 bucket '${bucketName}' deleted`);
  } catch (e) {
    if (e.message?.includes('NoSuchBucket')
        || e.message?.includes('not found')) {
      ok(`S3 bucket '${bucketName}' already gone`);
    } else {
      fail(`S3 bucket '${bucketName}' delete failed:`
        + ` ${e.message}`);
    }
  }

  // 15. Clean up SSM parameters
  console.log('');
  console.log('Cleaning up SSM parameters...');
  try {
    const json = aws.exec(
      `aws ssm get-parameters-by-path --path ${shellEscape('/' + stackName + '/')}` +
        ` --region ${shellEscape(region)} --query 'Parameters[*].Name'` +
        ` --output json`
    );
    const params = JSON.parse(json);
    for (const param of params) {
      try {
        aws.exec(
          `aws ssm delete-parameter --name ${shellEscape(param)}` +
            ` --region ${shellEscape(region)}`
        );
      } catch {
        // Ignore errors
      }
    }
  } catch {
    // Ignore errors (no parameters found)
  }
  ok('SSM parameters removed');

  // 15b. Delete Amplify app if present
  if (cfg.frontend?.amplifyAppId) {
    const amplifyAppId = cfg.frontend.amplifyAppId;
    console.log('');
    const deleteAmplify = await confirm(
      `Delete Amplify app ${amplifyAppId}? (y/N): `
    );
    if (deleteAmplify.toLowerCase() === 'y') {
      try {
        amplify.deleteApp({ appId: amplifyAppId, region });
        ok(`Amplify app '${amplifyAppId}' deleted`);
      } catch (e) {
        fail(`Amplify app '${amplifyAppId}' delete failed: ${e.message}`);
      }
    } else {
      ok(`Amplify app '${amplifyAppId}' kept`);
    }
  }

  // 16. Remove .boa/ directory
  console.log('');
  console.log('Removing .boa/...');
  rmSync(join(process.cwd(), '.boa'), {
    recursive: true,
    force: true,
  });
  ok('Local configuration removed');

  // 17. Verify resource cleanup
  console.log('');
  console.log('Verifying resource cleanup...');
  let allClean = true;
  const manualCommands = [];

  try {
    const clusterJson = aws.exec(
      `aws dsql get-cluster`
        + ` --identifier ${shellEscape(dsqlClusterId)}`
        + ` --region ${shellEscape(region)}`
        + ` --output json`
    );
    const cluster = JSON.parse(clusterJson);
    if (cluster.status === 'DELETING'
        || cluster.status === 'DELETED') {
      ok(`DSQL cluster: ${cluster.status}`);
    } else {
      fail(`DSQL cluster still exists`
        + ` (status: ${cluster.status})`);
      allClean = false;
      manualCommands.push(
        `aws dsql delete-cluster`
          + ` --identifier ${dsqlClusterId}`
          + ` --region ${region}`
      );
    }
  } catch {
    ok('DSQL cluster: gone');
  }

  if (userPoolId) {
    try {
      aws.exec(
        `aws cognito-idp describe-user-pool`
          + ` --user-pool-id ${shellEscape(userPoolId)}`
          + ` --region ${shellEscape(region)}`
      );
      fail('Cognito user pool still exists');
      allClean = false;
      manualCommands.push(
        `aws cognito-idp delete-user-pool`
          + ` --user-pool-id ${userPoolId}`
          + ` --region ${region}`
      );
    } catch {
      ok('Cognito user pool: gone');
    }
  }

  try {
    aws.exec(
      `aws s3api head-bucket`
        + ` --bucket ${shellEscape(bucketName)}`
        + ` --region ${shellEscape(region)}`
    );
    fail('S3 bucket still exists');
    allClean = false;
    manualCommands.push(
      `aws s3api delete-bucket`
        + ` --bucket ${bucketName}`
        + ` --region ${region}`
    );
  } catch {
    ok('S3 bucket: gone');
  }

  if (!allClean) {
    console.log('');
    console.log(
      'WARNING: Some resources were not fully cleaned up.'
    );
    console.log('Run these commands manually to finish:');
    for (const cmd of manualCommands) {
      console.log(`  ${cmd}`);
    }
  }

  // 18. Print completion message
  console.log('');
  console.log(
    `Teardown complete. Stack '${stackName}' has been destroyed.`
  );

  if (!allClean) {
    process.exit(1);
  }
}

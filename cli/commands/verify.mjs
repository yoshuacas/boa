import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { pass, fail, header } from '../lib/output.mjs';

export default async function verify(_args) {
  const cfg = config.requireConfig();
  const { stackName, region, apiUrl, userPoolId, bucketName } = cfg;

  let passed = 0;
  let failed = 0;

  function check(ok, msg) {
    if (ok) {
      pass(msg);
      passed++;
    } else {
      fail(msg);
      failed++;
    }
  }

  header('BOA Verification');
  console.log('');
  console.log(`  Stack:  ${stackName}`);
  console.log(`  Region: ${region}`);
  console.log('');

  // Check 1: Cognito self-signup
  console.log('Checking Cognito configuration...');
  let adminOnly;
  try {
    adminOnly = aws.exec(
      `aws cognito-idp describe-user-pool` +
        ` --user-pool-id ${userPoolId} --region ${region}` +
        ` --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly'` +
        ` --output text`
    );
  } catch {
    adminOnly = 'ERROR';
  }
  if (adminOnly === 'False') {
    check(
      true,
      'Cognito self-signup enabled (AllowAdminCreateUserOnly=false)'
    );
  } else {
    check(
      false,
      `Cognito self-signup enabled (AllowAdminCreateUserOnly=false) — got: ${adminOnly}`
    );
  }

  // Check 2: Function URL permissions
  console.log('Checking Function URL permissions...');
  const functionName = `${stackName}-api`;
  let policy;
  try {
    const policyJson = aws.exec(
      `aws lambda get-policy` +
        ` --function-name ${functionName}` +
        ` --region ${region}` +
        ` --query 'Policy' --output text`
    );
    policy = JSON.parse(policyJson);
  } catch {
    policy = null;
  }

  if (policy) {
    const statements = policy.Statement || [];
    const hasInvokeFunctionUrl = statements.some(
      (s) => s.Effect === 'Allow'
        && s.Action === 'lambda:InvokeFunctionUrl'
    );
    const hasInvokeFunction = statements.some(
      (s) => s.Effect === 'Allow'
        && s.Action === 'lambda:InvokeFunction'
    );
    check(
      hasInvokeFunctionUrl,
      'Function URL has lambda:InvokeFunctionUrl permission'
    );
    if (hasInvokeFunction) {
      check(
        true,
        'Function URL has lambda:InvokeFunction permission'
      );
    } else {
      check(
        false,
        'Function URL has lambda:InvokeFunction permission'
          + " — missing since October 2025, run 'boa deploy'"
          + ' to fix'
      );
    }
  } else {
    check(
      false,
      'Function URL resource policy exists'
    );
  }

  // Check 3: API endpoint is responding (not 500)
  console.log('Checking API endpoint...');
  let httpCode;
  try {
    httpCode = aws.exec(
      `curl -s -o /dev/null -w '%{http_code}' ${apiUrl}/rest/v1/`
    );
  } catch {
    httpCode = '000';
  }
  const validCodes = ['200', '401', '404'];
  if (validCodes.includes(httpCode)) {
    check(true, `API is responding (HTTP ${httpCode})`);
  } else {
    check(false, `API returns unexpected HTTP ${httpCode} (expected 200/401/404)`);
  }

  // Check 4: S3 bucket exists
  console.log('Checking S3 bucket...');
  let bucketExists;
  try {
    aws.exec(
      `aws s3api head-bucket --bucket ${bucketName} --region ${region}`
    );
    bucketExists = true;
  } catch {
    bucketExists = false;
  }
  check(bucketExists, 'S3 bucket exists');

  // Check 5: S3 bucket private
  let publicAccess;
  try {
    publicAccess = aws.exec(
      `aws s3api get-public-access-block --bucket ${bucketName}` +
        ` --region ${region}` +
        ` --query 'PublicAccessBlockConfiguration.BlockPublicAcls'` +
        ` --output text`
    );
  } catch {
    publicAccess = 'ERROR';
  }
  if (publicAccess === 'True') {
    check(true, 'S3 bucket has Block Public Access enabled');
  } else {
    check(
      false,
      `S3 bucket has Block Public Access enabled — got: ${publicAccess}`
    );
  }

  // Summary
  const total = passed + failed;
  console.log('');
  console.log('======================================');
  console.log(`  Results: ${passed}/${total} checks passed`);
  if (failed > 0) {
    console.log(`  ${failed} check(s) FAILED`);
    console.log('======================================');
    process.exit(1);
  } else {
    console.log('  All checks passed');
    console.log('======================================');
  }
}

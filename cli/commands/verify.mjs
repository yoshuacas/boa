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

  // Check 2: API Gateway returns 401/403
  console.log('Checking API endpoint...');
  let httpCode;
  try {
    httpCode = aws.exec(
      `curl -s -o /dev/null -w '%{http_code}' ${apiUrl}/items`
    );
  } catch {
    httpCode = '000';
  }
  if (httpCode === '401') {
    check(true, 'API returns 401 Unauthorized (not 500)');
  } else if (httpCode === '403') {
    check(true, 'API returns 403 Forbidden (Cognito authorizer active)');
  } else {
    check(false, `API returns 401/403 — got HTTP ${httpCode}`);
  }

  // Check 3: S3 bucket exists
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

  // Check 4: S3 bucket private
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

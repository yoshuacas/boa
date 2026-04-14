import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { pass, fail, header } from '../lib/output.mjs';

export default async function verify(_args) {
  const cfg = config.requireConfig();
  const {
    stackName, region, apiUrl, functionUrl,
    userPoolId, bucketName,
  } = cfg;

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

  const functionName = `${stackName}-api`;

  // Check 2: CloudFront distribution
  if (cfg.cloudfront) {
    console.log('Checking CloudFront distribution...');
    let distStatus;
    try {
      distStatus = aws.exec(
        `aws cloudfront get-distribution` +
          ` --id ${cfg.cloudfront.distributionId}` +
          ` --query 'Distribution.Status'` +
          ` --output text`
      );
    } catch {
      distStatus = null;
    }
    check(
      distStatus === 'Deployed',
      'CloudFront distribution is deployed'
    );

    // Check 3: WAF attached (us-east-1 only)
    if (region === 'us-east-1') {
      let wafArn;
      try {
        const distArn =
          `arn:aws:cloudfront::${cfg.accountId}` +
          `:distribution/` +
          `${cfg.cloudfront.distributionId}`;
        wafArn = aws.exec(
          `aws wafv2 get-web-acl-for-resource` +
            ` --resource-arn ${distArn}` +
            ` --region us-east-1` +
            ` --query 'WebACL.ARN' --output text`
        );
      } catch {
        wafArn = null;
      }
      check(
        wafArn && wafArn !== 'None',
        'WAF WebACL is attached to distribution'
      );
    }
  }

  // Checks 4-5 only apply when CloudFront is the active traffic layer
  const extensions = cfg.extensions || [];
  const hasCloudFront = cfg.cloudfront && !extensions.includes('api-gateway');

  if (hasCloudFront) {
    // Check 4: CloudFront permission
    console.log('Checking Function URL permissions...');
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
      const hasCfPermission = statements.some(
        (s) => s.Effect === 'Allow'
          && s.Action === 'lambda:InvokeFunctionUrl'
          && s.Principal?.Service ===
             'cloudfront.amazonaws.com'
      );
      check(
        hasCfPermission,
        'CloudFront has lambda:InvokeFunctionUrl permission'
      );
    } else {
      check(false, 'Function URL resource policy exists');
    }

    // Check 5: Direct Function URL returns 403
    if (cfg.functionUrl) {
      console.log('Checking Function URL access...');
      let directCode;
      try {
        directCode = aws.exec(
          `curl -s -o /dev/null -w '%{http_code}'` +
            ` ${cfg.functionUrl}/rest/v1/`
        );
      } catch {
        directCode = '000';
      }
      check(
        directCode === '403',
        'Direct Function URL returns 403 (protected by IAM)'
      );
    }
  }

  // Check 6: API endpoint responding through CloudFront
  console.log('Checking API endpoint...');
  let httpCode;
  try {
    httpCode = aws.exec(
      `curl -s -o /dev/null -w '%{http_code}'` +
        ` ${apiUrl}/rest/v1/`
    );
  } catch {
    httpCode = '000';
  }
  const validCodes = ['200', '401', '404'];
  if (validCodes.includes(httpCode)) {
    check(
      true,
      `API is responding through CloudFront (HTTP ${httpCode})`
    );
  } else {
    check(
      false,
      `API returns unexpected HTTP ${httpCode}`
      + ` (expected 200/401/404)`
    );
  }

  // Check 7: S3 bucket exists
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

  // Check 8: S3 bucket private
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

  // Check 9: Reserved concurrency
  console.log('Checking Lambda concurrency...');
  let concurrency;
  try {
    concurrency = aws.exec(
      `aws lambda get-function` +
        ` --function-name ${functionName}` +
        ` --region ${region}` +
        ` --query` +
        ` 'Concurrency.ReservedConcurrentExecutions'` +
        ` --output text`
    );
  } catch {
    concurrency = null;
  }
  check(
    concurrency && concurrency !== 'None',
    `Reserved concurrency is set (${concurrency})`
  );

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

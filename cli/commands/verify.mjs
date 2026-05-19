import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { pass, fail, header } from '../lib/output.mjs';
import { hasBetterAuthSchema } from '../lib/auth-schema.mjs';

export async function verifyFunctions(opts) {
  const {
    localDescriptors,
    deployedRegistry,
    stackName,
    ssmGetParameter,
    probeRoute,
  } = opts;

  const issues = [];

  const localNames = new Set(localDescriptors.map((f) => f.name));
  const deployedNames = new Set(Object.keys(deployedRegistry));

  for (const name of localNames) {
    if (!deployedNames.has(name)) {
      issues.push(`Function '${name}' is not deployed (run 'boa deploy')`);
    }
  }

  for (const name of deployedNames) {
    if (!localNames.has(name)) {
      issues.push(`Function '${name}' is deployed but missing locally`);
    }
  }

  for (const fn of localDescriptors) {
    if (!fn.secrets || fn.secrets.length === 0) continue;
    for (const secret of fn.secrets) {
      const paramPath = `/${stackName}/functions/${fn.name}/${secret}`;
      try {
        await ssmGetParameter(paramPath);
      } catch {
        issues.push(
          `Missing SSM parameter: ${paramPath}\n`
            + `  Store it with: aws ssm put-parameter `
            + `--name "${paramPath}" --value "..." --type String`,
        );
      }
    }
  }

  const publicFns = localDescriptors.filter(
    (f) => f.visibility === 'public',
  );
  for (const fn of publicFns) {
    try {
      const res = await probeRoute(fn.name);
      if (res.status >= 500) {
        issues.push(`Function '${fn.name}' is unreachable (HTTP ${res.status})`);
      }
    } catch {
      issues.push(`Function '${fn.name}' is unreachable (timeout or network error)`);
    }
  }

  return { passed: issues.length === 0, issues };
}

export default async function verify(_args) {
  const cfg = config.requireConfig();
  const {
    stackName, region, apiUrl,
    dsqlEndpoint, bucketName,
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

  // Check 1: Auth schema
  console.log('Checking auth schema...');
  let authReady = false;
  try {
    authReady = hasBetterAuthSchema(dsqlEndpoint, region);
  } catch {
    authReady = false;
  }
  if (authReady) {
    check(
      true,
      'better-auth schema is ready'
    );
  } else {
    check(
      false,
      'better-auth schema is missing or incomplete'
    );
  }

  const functionName = `${stackName}-api`;

  // Check: API Gateway stage + WAF
  if (cfg.apiGateway) {
    console.log('Checking API Gateway...');
    let stageExists;
    try {
      aws.exec(
        `aws apigateway get-stage`
          + ` --rest-api-id ${aws.shellEscape(cfg.apiGateway.restApiId)}`
          + ` --stage-name ${aws.shellEscape(cfg.apiGateway.stage)}`
          + ` --region ${aws.shellEscape(region)}`
          + ` --output text --query 'stageName'`
      );
      stageExists = true;
    } catch {
      stageExists = false;
    }
    check(
      stageExists,
      `API Gateway stage '${cfg.apiGateway.stage}' exists`
    );

    console.log('Checking WAF attachment...');
    const stageArn =
      `arn:aws:apigateway:${region}`
        + `::/restapis/${cfg.apiGateway.restApiId}`
        + `/stages/${cfg.apiGateway.stage}`;
    let wafArn;
    try {
      wafArn = aws.exec(
        `aws wafv2 get-web-acl-for-resource`
          + ` --resource-arn ${aws.shellEscape(stageArn)}`
          + ` --region ${aws.shellEscape(region)}`
          + ` --query 'WebACL.ARN' --output text`
      );
    } catch {
      wafArn = null;
    }
    if (wafArn && wafArn !== 'None') {
      check(
        true,
        'WAF WebACL is attached to API Gateway stage'
      );
    } else {
      check(
        false,
        `WAF WebACL is not attached to API Gateway`
          + ` stage (${stageArn})`
      );
    }
  }

  // Check: ALB target group health
  if (cfg.alb) {
    console.log('Checking ALB target group...');
    let tgHealth;
    let tgReason;
    try {
      tgHealth = aws.exec(
        `aws elbv2 describe-target-health`
          + ` --target-group-arn ${aws.shellEscape(cfg.alb.targetGroupArn)}`
          + ` --region ${aws.shellEscape(region)}`
          + ` --query 'TargetHealthDescriptions[0].TargetHealth.State'`
          + ` --output text`
      );
      tgReason = aws.exec(
        `aws elbv2 describe-target-health`
          + ` --target-group-arn ${aws.shellEscape(cfg.alb.targetGroupArn)}`
          + ` --region ${aws.shellEscape(region)}`
          + ` --query 'TargetHealthDescriptions[0].TargetHealth.Reason'`
          + ` --output text`
      );
    } catch {
      tgHealth = null;
      tgReason = null;
    }
    const healthOk = tgHealth === 'healthy'
      || (tgHealth === 'unavailable'
        && tgReason === 'Target.HealthCheckDisabled');
    check(
      healthOk,
      `ALB target group is ready (${tgHealth})`
    );

    // Check 3: WAF attached to ALB
    console.log('Checking WAF attachment...');
    let wafArn;
    try {
      wafArn = aws.exec(
        `aws wafv2 get-web-acl-for-resource`
          + ` --resource-arn ${aws.shellEscape(cfg.alb.arn)}`
          + ` --region ${aws.shellEscape(region)}`
          + ` --query 'WebACL.ARN' --output text`
      );
    } catch {
      wafArn = null;
    }
    check(
      wafArn && wafArn !== 'None',
      'WAF WebACL is attached to ALB'
    );
  }

  // Check 4: API endpoint responding
  console.log('Checking API endpoint...');
  let httpCode;
  try {
    httpCode = aws.exec(
      `curl -s -o /dev/null -w '%{http_code}'`
        + ` ${aws.shellEscape(apiUrl + '/rest/v1/')}`
    );
  } catch {
    httpCode = '000';
  }
  const validCodes = ['200', '401', '404'];
  if (validCodes.includes(httpCode)) {
    check(
      true,
      `API is responding (HTTP ${httpCode})`
    );
  } else {
    check(
      false,
      `API returns unexpected HTTP ${httpCode}`
      + ` (expected 200/401/404)`
    );
  }

  // Check 5: S3 bucket exists
  console.log('Checking S3 bucket...');
  let bucketExists;
  try {
    aws.exec(
      `aws s3api head-bucket --bucket ${aws.shellEscape(bucketName)} --region ${aws.shellEscape(region)}`
    );
    bucketExists = true;
  } catch {
    bucketExists = false;
  }
  check(bucketExists, 'S3 bucket exists');

  // Check 6: S3 bucket private
  let publicAccess;
  try {
    publicAccess = aws.exec(
      `aws s3api get-public-access-block --bucket ${aws.shellEscape(bucketName)}`
        + ` --region ${aws.shellEscape(region)}`
        + ` --query 'PublicAccessBlockConfiguration.BlockPublicAcls'`
        + ` --output text`
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

  // Check: Reserved concurrency (ALB only)
  if (cfg.alb) {
    console.log('Checking Lambda concurrency...');
    let concurrency;
    try {
      concurrency = aws.exec(
        `aws lambda get-function`
          + ` --function-name ${aws.shellEscape(functionName)}`
          + ` --region ${aws.shellEscape(region)}`
          + ` --query 'Concurrency.ReservedConcurrentExecutions'`
          + ` --output text`
      );
    } catch {
      concurrency = null;
    }
    check(
      concurrency && concurrency !== 'None',
      `Reserved concurrency is set (${concurrency})`
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

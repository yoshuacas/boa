import { existsSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as sam from '../lib/sam.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import { resolveTemplate } from '../lib/extensions.mjs';
import { copySkill } from '../lib/skill.mjs';

export function needsMigrationWarning(cfg) {
  const extensions = cfg.extensions || [];
  // API Gateway -> CloudFront migration
  if (cfg.apiUrl &&
    cfg.apiUrl.includes('execute-api.') &&
    cfg.apiUrl.includes('.amazonaws.com') &&
    !extensions.includes('api-gateway')) {
    return 'This version of BOA uses CloudFront + WAF by default instead of API Gateway.';
  }
  // Function URL -> CloudFront migration
  if (cfg.apiUrl &&
    cfg.apiUrl.includes('lambda-url.') &&
    !cfg.cloudfront) {
    return 'This version of BOA adds CloudFront + WAF protection.';
  }
  return null;
}

export default async function deploy(_args) {
  // 1. Load config (exits if missing)
  const cfg = config.requireConfig();

  // 2. Read stack name and region
  const { stackName, region } = cfg;

  // 3. Print header
  console.log(
    `Deploying stack '${stackName}' in region '${region}'...`
  );
  console.log('');

  // Warn if API URL will change (API GW -> CloudFront, or Function URL -> CloudFront)
  const migration = needsMigrationWarning(cfg);
  if (migration) {
    console.log(`  ! ${migration}`);
    console.log(
      '    Your API URL will change. Update your frontend config after deploy.'
    );
    console.log('');
  }

  // 4-5. SAM build
  console.log('Building SAM application...');
  const buildDir = join(process.cwd(), '.boa', '.aws-sam', 'build');
  const templatePath = resolveTemplate(process.cwd());
  sam.build(templatePath, buildDir, region);

  // 6. Copy Cedar policies if present
  const policiesDir = join(process.cwd(), 'policies');
  if (existsSync(policiesDir)) {
    const policyFiles = readdirSync(policiesDir);
    if (policyFiles.length > 0) {
      const dest = join(buildDir, 'ApiFunction', 'policies');
      cpSync(policiesDir, dest, { recursive: true });
    }
  }

  console.log('');

  // 7. SAM deploy
  console.log('Deploying...');
  const builtTemplate = join(buildDir, 'template.yaml');
  // Pass ApiBaseUrl from previous deploy so OpenAPI spec uses the public URL
  const cfDomain = cfg.cloudfront?.domainName;
  const extraParams = cfDomain
    ? { ApiBaseUrl: `https://${cfDomain}/rest/v1` }
    : {};
  sam.deploy(builtTemplate, stackName, region, extraParams);

  // 8. Extract fresh CloudFormation outputs
  console.log('');
  console.log('Updating configuration...');
  const outputs = aws.cfnDescribeStacks(stackName, region);
  const cloudFrontUrl = getOutputValue(
    outputs, 'CloudFrontUrl'
  );
  const distributionId = getOutputValue(
    outputs, 'CloudFrontDistributionId'
  );
  const throttleTopicArn = getOutputValue(
    outputs, 'ThrottleAlarmTopicArn'
  );
  const functionUrlOutput = getOutputValue(
    outputs, 'ApiFunctionUrl'
  );
  let apiUrl = cloudFrontUrl || functionUrlOutput;
  const userPoolId = getOutputValue(outputs, 'UserPoolId');
  const userPoolClientId = getOutputValue(
    outputs, 'UserPoolClientId'
  );
  const bucketName = getOutputValue(outputs, 'BucketName');
  const dsqlEndpoint = getOutputValue(outputs, 'DsqlEndpoint');

  // 9. Build config — preserve keys and accountId
  const extensions = cfg.extensions || [];
  const updatedConfig = {
    stackName,
    region,
    accountId: cfg.accountId,
    apiUrl,
    functionUrl: functionUrlOutput,
    anonKey: cfg.anonKey,
    serviceRoleKey: cfg.serviceRoleKey,
    userPoolId,
    userPoolClientId,
    bucketName,
    dsqlEndpoint,
    deployedAt: new Date().toISOString(),
    extensions,
  };

  // Add cloudfront object when CloudFront is active
  if (distributionId && cloudFrontUrl) {
    updatedConfig.cloudfront = {
      distributionId,
      domainName: new URL(cloudFrontUrl).hostname,
      throttleTopicArn: throttleTopicArn || undefined,
    };
  }

  // When api-gateway extension is active, use Gateway URL
  // and remove cloudfront object
  if (extensions.includes('api-gateway')) {
    const gatewayUrl = getOutputValue(
      outputs, 'ApiGatewayUrl'
    );
    if (gatewayUrl) {
      updatedConfig.apiUrl = gatewayUrl;
    }
    delete updatedConfig.cloudfront;
  }

  config.write(updatedConfig);

  // Refresh bundled skill from CLI
  copySkill(process.cwd());

  console.log('');
  console.log(
    'Deploy complete. Configuration updated at .boa/config.json'
  );
  console.log(`API URL: ${apiUrl}`);

  // 10. Run migrations if any .sql files exist
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
}

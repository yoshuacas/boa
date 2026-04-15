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
  // CloudFront -> ALB migration (old deploy used CloudFront)
  if (cfg.cloudfront && !cfg.alb) {
    return 'This version of BOA uses ALB + WAF by default instead of CloudFront.';
  }
  // Function URL -> ALB migration (old deploy with raw Function URL)
  if (cfg.apiUrl &&
    cfg.apiUrl.includes('lambda-url.') &&
    !cfg.alb) {
    return 'This version of BOA adds ALB + WAF protection.';
  }
  // API Gateway -> ALB migration
  if (cfg.apiUrl &&
    cfg.apiUrl.includes('execute-api.') &&
    cfg.apiUrl.includes('.amazonaws.com') &&
    !extensions.includes('api-gateway')) {
    return 'This version of BOA uses ALB + WAF by default instead of API Gateway.';
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

  // Warn if API URL will change
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
  sam.deploy(builtTemplate, stackName, region);

  // 8. Extract fresh CloudFormation outputs
  console.log('');
  console.log('Updating configuration...');
  const outputs = aws.cfnDescribeStacks(stackName, region);
  const albUrl = getOutputValue(outputs, 'AlbUrl');
  const albArn = getOutputValue(outputs, 'AlbArn');
  const targetGroupArn = getOutputValue(outputs, 'TargetGroupArn');
  const vpcId = getOutputValue(outputs, 'VpcId');
  let apiUrl = albUrl;
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
    alb: albArn ? {
      arn: albArn,
      dnsName: new URL(apiUrl).hostname,
      targetGroupArn,
      vpcId,
    } : undefined,
    anonKey: cfg.anonKey,
    serviceRoleKey: cfg.serviceRoleKey,
    userPoolId,
    userPoolClientId,
    bucketName,
    dsqlEndpoint,
    deployedAt: new Date().toISOString(),
    extensions,
  };

  // When api-gateway extension is active, use Gateway URL
  // and remove alb object
  if (extensions.includes('api-gateway')) {
    const gatewayUrl = getOutputValue(
      outputs, 'ApiGatewayUrl'
    );
    if (gatewayUrl) {
      updatedConfig.apiUrl = gatewayUrl;
    }
    delete updatedConfig.alb;
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

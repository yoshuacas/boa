import {
  existsSync, readdirSync, cpSync,
  mkdirSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as sam from '../lib/sam.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import {
  resolveTemplate, mergeTemplate,
} from '../lib/extensions.mjs';
import { ensureLambdaDepsInstalled } from '../lib/lambda-deps.mjs';
import { getPinnedPgrestLambdaVersion } from '../lib/lambda-deps.mjs';
import { copySkill } from '../lib/skill.mjs';
import { bootstrapBetterAuthSchema } from '../lib/auth-schema.mjs';

export function needsMigrationWarning(cfg) {
  const extensions = cfg.extensions || [];
  if (cfg.alb && !extensions.includes('alb')) {
    return 'This project uses ALB as the traffic layer'
      + ' (legacy default). Keeping ALB.';
  }
  if (cfg.cloudfront && !cfg.apiGateway) {
    return 'This version of BOA uses API Gateway REST'
      + ' + WAF by default instead of CloudFront.';
  }
  if (cfg.apiUrl
      && cfg.apiUrl.includes('lambda-url.')
      && !cfg.apiGateway) {
    return 'This version of BOA uses API Gateway REST'
      + ' + WAF by default.';
  }
  return null;
}

export function buildDeployConfig(cfg, outputs, extensions) {
  const apiGatewayUrl = getOutputValue(
    outputs, 'ApiGatewayUrl'
  );
  const restApiId = getOutputValue(outputs, 'RestApiId');
  const bucketName = getOutputValue(outputs, 'BucketName');
  const dsqlEndpoint = getOutputValue(
    outputs, 'DsqlEndpoint'
  );

  const filtered = extensions.filter(
    e => e !== 'api-gateway'
  );
  const result = {
    stackName: cfg.stackName,
    region: cfg.region,
    accountId: cfg.accountId,
    apiUrl: apiGatewayUrl,
    apiGateway: restApiId ? {
      restApiId,
      stage: 'prod',
    } : undefined,
    anonKey: cfg.anonKey,
    serviceRoleKey: cfg.serviceRoleKey,
    authProvider: cfg.authProvider || 'better-auth',
    pgrestLambdaVersion: getPinnedPgrestLambdaVersion(),
    bucketName,
    dsqlEndpoint,
    deployedAt: new Date().toISOString(),
    extensions: filtered,
  };

  if (filtered.includes('alb')) {
    const albUrl = getOutputValue(outputs, 'AlbUrl');
    const albArn = getOutputValue(outputs, 'AlbArn');
    const targetGroupArn = getOutputValue(
      outputs, 'TargetGroupArn'
    );
    const vpcId = getOutputValue(outputs, 'VpcId');
    if (albUrl) result.apiUrl = albUrl;
    result.alb = (albArn && albUrl) ? {
      arn: albArn,
      dnsName: new URL(albUrl).hostname,
      targetGroupArn,
      vpcId,
    } : undefined;
    delete result.apiGateway;
  }

  return result;
}

export default async function deploy(_args, opts = {}) {
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

  // 4. Legacy ALB detection — must happen BEFORE resolveTemplate()
  const extensions = cfg.extensions || [];
  if (cfg.alb && !extensions.includes('alb')) {
    console.log(
      '  Adding alb to extensions for explicit tracking.'
    );
    const merged = mergeTemplate(['alb']);
    mkdirSync(join(process.cwd(), '.boa'), { recursive: true });
    writeFileSync(
      join(process.cwd(), '.boa', 'template.yaml'), merged
    );
    extensions.push('alb');
  }

  // 5. Ensure lambda dependencies match the pinned pgrest-lambda version
  ensureLambdaDepsInstalled();

  // 6. SAM build
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
  const extraParams = {};
  if (Array.isArray(cfg.allowedOrigins) && cfg.allowedOrigins.length > 0) {
    // CloudFormation CommaDelimitedList wants a single string here
    extraParams.AllowedOrigins = cfg.allowedOrigins.join(',');
  }
  if (cfg.certificateArn) {
    extraParams.CertificateArn = cfg.certificateArn;
  }
  sam.deploy(builtTemplate, stackName, region, extraParams);

  // 8. Extract fresh CloudFormation outputs
  console.log('');
  console.log('Updating configuration...');
  const outputs = aws.cfnDescribeStacks(stackName, region);

  // 8b. Keep better-auth's private schema present after deploys.
  const dsqlEndpoint = getOutputValue(outputs, 'DsqlEndpoint');
  if ((cfg.authProvider || 'better-auth') === 'better-auth') {
    console.log('Creating auth tables...');
    bootstrapBetterAuthSchema(dsqlEndpoint, region);
  }

  if (opts.skipConfigWrite) {
    return outputs;
  }

  // 9. Build config — preserve keys and accountId
  const updatedConfig = buildDeployConfig(
    cfg, outputs, extensions
  );
  config.write(updatedConfig);

  // Refresh bundled skill from CLI
  copySkill(process.cwd());

  console.log('');
  console.log(
    'Deploy complete. Configuration updated at .boa/config.json'
  );
  console.log(`API URL: ${updatedConfig.apiUrl}`);

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

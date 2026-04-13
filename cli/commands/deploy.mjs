import { existsSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as sam from '../lib/sam.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import { resolveTemplate } from '../lib/extensions.mjs';

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

  // Warn if upgrading from API Gateway to Function URLs
  const existingExtensions = cfg.extensions || [];
  if (
    cfg.apiUrl &&
    cfg.apiUrl.includes('execute-api.') &&
    cfg.apiUrl.includes('.amazonaws.com') &&
    !existingExtensions.includes('api-gateway')
  ) {
    console.log(
      '  \u26a0 This version of boa uses Lambda Function URLs by default.'
    );
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
  let apiUrl = getOutputValue(outputs, 'ApiFunctionUrl');
  const userPoolId = getOutputValue(outputs, 'UserPoolId');
  const userPoolClientId = getOutputValue(
    outputs, 'UserPoolClientId'
  );
  const bucketName = getOutputValue(outputs, 'BucketName');
  const dsqlEndpoint = getOutputValue(outputs, 'DsqlEndpoint');

  // 9. Handle api-gateway extension URL extraction
  const extensions = cfg.extensions || [];
  let functionUrl = null;

  if (extensions.includes('api-gateway')) {
    const gatewayUrl = getOutputValue(
      outputs, 'ApiGatewayUrl'
    );
    if (gatewayUrl) {
      functionUrl = apiUrl; // Function URL
      apiUrl = gatewayUrl;  // API Gateway URL as primary
    }
  }

  // 10. Update config — preserve keys and accountId
  const updatedConfig = {
    stackName,
    region,
    accountId: cfg.accountId,
    apiUrl,
    anonKey: cfg.anonKey,
    serviceRoleKey: cfg.serviceRoleKey,
    userPoolId,
    userPoolClientId,
    bucketName,
    dsqlEndpoint,
    deployedAt: new Date().toISOString(),
    extensions,
  };
  if (functionUrl) {
    updatedConfig.functionUrl = functionUrl;
  }
  config.write(updatedConfig);

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

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDocument } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSIONS_DIR = join(__dirname, '..', 'extensions');
const BASE_TEMPLATE = join(__dirname, '..', 'templates', 'backend.yaml');

export function getRegistry() {
  return {
    'api-gateway': {
      description: 'API Gateway REST with rate limiting, WAF, usage plans',
      fragmentPath: join(EXTENSIONS_DIR, 'api-gateway', 'fragment.yaml'),
    },
  };
}

/**
 * Read the base template and merge extension fragments.
 * With no extensions, returns the base template as-is.
 * Uses parseDocument to preserve CloudFormation tags
 * (!Sub, !Ref, !GetAtt, etc.) during the round-trip.
 */
export function mergeTemplate(extensions) {
  const baseText = readFileSync(BASE_TEMPLATE, 'utf8');
  if (!extensions || extensions.length === 0) {
    return baseText;
  }
  const registry = getRegistry();
  const doc = parseDocument(baseText);
  for (const ext of extensions) {
    if (!(ext in registry)) {
      throw new Error(`Unknown extension: ${ext}`);
    }
    const fragment = parseDocument(
      readFileSync(registry[ext].fragmentPath, 'utf8'),
    );
    const fragResources = fragment.get('Resources', true);
    if (fragResources) {
      const baseResources = doc.get('Resources', true);
      for (const item of fragResources.items) {
        baseResources.add(item);
      }
    }
    const fragOutputs = fragment.get('Outputs', true);
    if (fragOutputs) {
      const baseOutputs = doc.get('Outputs', true);
      for (const item of fragOutputs.items) {
        baseOutputs.add(item);
      }
    }
  }

  // Extension-specific transforms:
  // SAM requires Events on the function resource itself —
  // a separate fragment cannot inject events into an existing function.
  if (extensions.includes('api-gateway')) {
    // Remove CloudFront resources
    const cloudFrontResources = [
      'CloudFrontDistribution', 'CloudFrontOAC',
      'CloudFrontCachePolicy',
      'CloudFrontOriginRequestPolicy',
      'CloudFrontInvokePermission',
      'CloudFrontInvokePermissionV2',
      'WafWebAcl', 'WafAssociation',
      'LambdaThrottleAlarm', 'ThrottleAlarmTopic',
    ];
    const baseResources = doc.get('Resources', true);
    for (const name of cloudFrontResources) {
      baseResources.delete(name);
    }

    // Revert AuthType to NONE for API Gateway
    doc.setIn(
      ['Resources', 'ApiFunction', 'Properties',
       'FunctionUrlConfig', 'AuthType'],
      'NONE',
    );

    // Remove reserved concurrency (API Gateway has its
    // own throttling)
    const apiProps = doc.getIn(
      ['Resources', 'ApiFunction', 'Properties'], true,
    );
    apiProps.delete('ReservedConcurrentExecutions');

    // Restore CORS on FunctionUrlConfig
    const corsNode = doc.createNode({
      AllowHeaders: [
        'Content-Type', 'Authorization', 'apikey',
        'Prefer', 'Accept', 'x-client-info',
        'X-Client-Info', 'X-Supabase-Api-Version',
        'content-profile', 'accept-profile',
      ],
      AllowMethods: [
        'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
      ],
      AllowOrigins: ['*'],
      MaxAge: 600,
    });
    const funcUrlConfig = doc.getIn(
      ['Resources', 'ApiFunction', 'Properties',
       'FunctionUrlConfig'], true,
    );
    funcUrlConfig.set('Cors', corsNode);

    // Restore public invoke permissions
    const urlPerm = doc.createNode({
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: { 'Fn::GetAtt': ['ApiFunction', 'Arn'] },
        Action: 'lambda:InvokeFunctionUrl',
        Principal: '*',
        FunctionUrlAuthType: 'NONE',
      },
    });
    const invokePerm = doc.createNode({
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: { 'Fn::GetAtt': ['ApiFunction', 'Arn'] },
        Action: 'lambda:InvokeFunction',
        Principal: '*',
        InvokedViaFunctionUrl: true,
      },
    });
    baseResources.set('ApiFunctionUrlPermission', urlPerm);
    baseResources.set(
      'ApiFunctionInvokePermission', invokePerm,
    );

    // Remove CloudFront-related outputs
    const baseOutputs = doc.get('Outputs', true);
    for (const key of [
      'CloudFrontUrl', 'CloudFrontDistributionId',
      'ThrottleAlarmTopicArn',
    ]) {
      baseOutputs.delete(key);
    }

    // Remove CloudFront-only condition
    const conditions = doc.get('Conditions', true);
    if (conditions) {
      conditions.delete('IsUsEast1');
      // Remove empty Conditions section
      if (conditions.items && conditions.items.length === 0) {
        doc.delete('Conditions');
      }
    }

    // Add Events for API Gateway
    const props = doc.getIn(
      ['Resources', 'ApiFunction', 'Properties'], true,
    );
    const events = doc.createNode({
      ProxyRoot: {
        Type: 'Api',
        Properties: {
          RestApiId: { Ref: 'Api' },
          Path: '/',
          Method: 'ANY',
        },
      },
      ProxyPlus: {
        Type: 'Api',
        Properties: {
          RestApiId: { Ref: 'Api' },
          Path: '/{proxy+}',
          Method: 'ANY',
        },
      },
    });
    props.set('Events', events);
  }

  return doc.toString();
}

/**
 * Resolve which template file to use for a project.
 * Priority: BOA_TEMPLATE_OVERRIDE > .boa/template.yaml > bundled default.
 */
export function resolveTemplate(projectDir) {
  if (process.env.BOA_TEMPLATE_OVERRIDE) {
    return process.env.BOA_TEMPLATE_OVERRIDE;
  }
  const local = join(projectDir, '.boa', 'template.yaml');
  if (existsSync(local)) {
    return local;
  }
  return BASE_TEMPLATE;
}

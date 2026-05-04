import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDocument } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSIONS_DIR = join(__dirname, '..', 'extensions');
const BASE_TEMPLATE = join(__dirname, '..', 'templates', 'backend.yaml');
const LAMBDA_DIR = join(__dirname, '..', 'templates', 'lambda');

export function getRegistry() {
  return {
    'api-gateway': {
      description: 'API Gateway REST (now the default)',
      deprecated: true,
      fragmentPath: null,
    },
    'alb': {
      description: 'ALB + VPC + HTTP listener for long requests or streaming',
      fragmentPath: join(EXTENSIONS_DIR, 'alb', 'fragment.yaml'),
    },
    'realtime': {
      description: 'Realtime channels (postgres_changes, broadcast) via AppSync Events',
      fragmentPath: join(EXTENSIONS_DIR, 'realtime', 'fragment.yaml'),
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

  // Filter out deprecated no-op extensions
  const active = extensions.filter(e => {
    const entry = registry[e];
    if (!entry) throw new Error(`Unknown extension: ${e}`);
    return !entry.deprecated;
  });

  if (active.length === 0) return baseText;

  const doc = parseDocument(baseText);

  // The base template's CodeUri is relative (`./lambda/`) and resolves
  // against the bundled cli/templates/ dir. When we write the merged
  // template to `.boa/template.yaml`, the same relative path would
  // resolve to `.boa/lambda/` and SAM would quietly skip the build.
  // Rewrite to the absolute path of the bundled lambda directory.
  doc.setIn(
    ['Resources', 'ApiFunction', 'Properties', 'CodeUri'],
    LAMBDA_DIR,
  );

  for (const ext of active) {
    const entry = registry[ext];
    const fragment = parseDocument(
      readFileSync(entry.fragmentPath, 'utf8'),
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

  if (active.includes('realtime')) {
    // Inject REALTIME_HTTP_ENDPOINT onto the ApiFunction so the
    // publisher knows where to POST. The env var is only meaningful
    // when the AppSync fragment is merged in, so we add it here
    // rather than in the base template.
    const envVars = doc.getIn(
      [
        'Resources', 'ApiFunction', 'Properties',
        'Environment', 'Variables',
      ],
      true,
    );
    if (envVars) {
      const scalar = doc.createNode({
        'Fn::GetAtt': ['RealtimeEventApi', 'Dns.Http'],
      });
      envVars.set('REALTIME_HTTP_ENDPOINT', scalar);
    }
  }

  if (active.includes('alb')) {
    const baseResources = doc.get('Resources', true);
    baseResources.delete('Api');
    baseResources.delete('WafApiGatewayAssociation');

    const apiProps = doc.getIn(
      ['Resources', 'ApiFunction', 'Properties'], true,
    );
    apiProps.delete('Events');

    apiProps.set(
      'ReservedConcurrentExecutions', doc.createNode(50),
    );

    // BETTER_AUTH_URL and API_BASE_URL are derived at request time
    // in lambda/index.mjs (from the Host / X-Forwarded-Proto headers)
    // so the template does not need to inject them here. Keeps the
    // stack free of circular dependencies between the function, the
    // ALB listener, and the WAF association.

    const baseOutputs = doc.get('Outputs', true);
    baseOutputs.delete('ApiGatewayUrl');
    baseOutputs.delete('RestApiId');
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

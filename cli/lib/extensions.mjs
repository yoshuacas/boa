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
      description: 'API Gateway REST (now the default)',
      deprecated: true,
      fragmentPath: null,
    },
    'alb': {
      description: 'ALB + VPC + HTTP listener for long requests or streaming',
      fragmentPath: join(EXTENSIONS_DIR, 'alb', 'fragment.yaml'),
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

  for (const ext of active) {
    const entry = registry[ext];
    const fragment = parseDocument(
      readFileSync(entry.fragmentPath, 'utf8'),
    );
    for (const section of ['Parameters', 'Resources', 'Outputs']) {
      const frag = fragment.get(section, true);
      if (!frag) continue;
      const base = doc.get(section, true);
      for (const item of frag.items) base.add(item);
    }
  }

  if (active.includes('alb')) {
    // ALB replaces the API Gateway stack. Strip every API Gateway
    // resource the base template installs so the merged stack ends
    // up with only the ALB traffic layer.
    const baseResources = doc.get('Resources', true);
    const apiGatewayResources = [
      'Api',
      'ApiProxyPlusResource',
      'ApiRootMethod',
      'ApiProxyPlusMethod',
      'ApiDeployment',
      'ApiprodStage',
      'ApiFunctionProxyRootPermissionprod',
      'ApiFunctionProxyPlusPermissionprod',
      'WafApiGatewayAssociation',
      'FunctionsApiResource',
      'FunctionsApiV1Resource',
      'FunctionsApiNameResource',
      'FunctionsApiMethod',
      'FunctionsLambdaPermission',
    ];
    for (const r of apiGatewayResources) baseResources.delete(r);

    const apiProps = doc.getIn(
      ['Resources', 'ApiFunction', 'Properties'], true,
    );
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

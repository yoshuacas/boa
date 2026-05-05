import fs from 'fs/promises';
import path from 'path';
import { BoaConfig } from '@/types/boa';
import { isCloud } from './studio-mode';

export function getDsqlEndpoint(cfg: BoaConfig): string {
  return cfg.dsql_endpoint || cfg.dsqlEndpoint || cfg.database?.endpoint || '';
}

export function getStackName(cfg: BoaConfig): string {
  return cfg.stack_name || cfg.stackName || 'boa-stack';
}

export function getLambdaName(cfg: BoaConfig): string {
  return cfg.lambda_function_name || cfg.lambdaFunctionName || cfg.lambda?.functionName || '';
}

export function getBucketName(cfg: BoaConfig): string {
  return cfg.bucketName || cfg.s3_bucket || cfg.s3Bucket || cfg.storage?.bucket || '';
}

export function getApiUrl(cfg: BoaConfig): string {
  return cfg.api_url || cfg.apiUrl || cfg.api?.url || '';
}

export function getDbName(cfg: BoaConfig): string {
  return cfg.dsql_database || cfg.database?.name || 'postgres';
}

export async function loadBoaConfig(configPath?: string): Promise<BoaConfig | null> {
  const result = await loadBoaConfigWithRoot(configPath);
  return result?.config ?? null;
}

export async function loadBoaConfigWithRoot(configPath?: string): Promise<{ config: BoaConfig; projectRoot: string } | null> {
  if (isCloud()) {
    return loadBoaConfigFromSSM();
  }
  return loadBoaConfigFromDisk(configPath);
}

async function loadBoaConfigFromDisk(configPath?: string): Promise<{ config: BoaConfig; projectRoot: string } | null> {
  const candidates = [
    configPath,
    process.env.BOA_CONFIG_PATH,
    '.boa/config.json',
    '../.boa/config.json',
    '../../.boa/config.json',
    process.env.HOME ? path.join(process.env.HOME, '.boa/config.json') : null,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const fullPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
      const content = await fs.readFile(fullPath, 'utf-8');
      const config = JSON.parse(content) as BoaConfig;
      // projectRoot is the directory containing .boa/
      const projectRoot = path.dirname(path.dirname(fullPath));
      return { config, projectRoot };
    } catch {
      // Try next path
    }
  }
  return null;
}

async function loadBoaConfigFromSSM(): Promise<{ config: BoaConfig; projectRoot: string } | null> {
  // Prefer the config baked in at build time — the SSR Lambda's auto-created
  // execution role doesn't have SSM permissions, so we embed the value during
  // the Amplify build (when the service role credentials are available).
  const inlineConfig = process.env.STUDIO_BOA_CONFIG;
  if (inlineConfig) {
    try {
      const config = JSON.parse(inlineConfig) as BoaConfig;
      return { config, projectRoot: '' };
    } catch {
      console.error('[studio] STUDIO_BOA_CONFIG is not valid JSON, falling back to SSM');
    }
  }

  const paramPath = process.env.STUDIO_SSM_CONFIG_PATH;
  if (!paramPath) {
    console.error('[studio] STUDIO_SSM_CONFIG_PATH is not set — cannot load config in cloud mode');
    return null;
  }

  try {
    const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
    const ssm = new SSMClient({});
    const res = await ssm.send(new GetParameterCommand({
      Name: paramPath,
      WithDecryption: true,
    }));
    const value = res.Parameter?.Value;
    if (!value) return null;
    const config = JSON.parse(value) as BoaConfig;
    return { config, projectRoot: '' };
  } catch (err) {
    console.error('[studio] Failed to load config from SSM:', err);
    return null;
  }
}

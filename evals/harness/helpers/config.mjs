import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load BOA config from .boa/config.json.
 * Searches upward from cwd to find the config file.
 */
export function loadConfig(basePath) {
  const paths = [
    basePath && resolve(basePath, '.boa/config.json'),
    resolve(process.cwd(), '.boa/config.json'),
    resolve(process.cwd(), '..', '.boa/config.json'),
  ].filter(Boolean);

  for (const p of paths) {
    try {
      const raw = readFileSync(p, 'utf-8');
      const config = JSON.parse(raw);
      return {
        apiUrl: config.apiUrl,
        anonKey: config.anonKey,
        serviceRoleKey: config.serviceRoleKey,
        stackName: config.stackName,
        region: config.region || 'us-east-1',
        userPoolId: config.userPoolId,
        bucketName: config.bucketName,
        dsqlEndpoint: config.dsqlEndpoint,
      };
    } catch {
      continue;
    }
  }

  throw new Error('Could not find .boa/config.json — is the backend deployed?');
}

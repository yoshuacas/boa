import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const RESERVED_NAMES = ['v1', 'health', '_internal'];

export async function discover(functionsDir, opts = {}) {
  if (!existsSync(functionsDir)) return [];

  const entries = readdirSync(functionsDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  const descriptors = [];

  for (const dir of dirs) {
    const name = dir.name;

    if (RESERVED_NAMES.includes(name)) {
      throw new Error(
        `Reserved function name '${name}'. Choose a different name.`,
      );
    }

    if (!NAME_PATTERN.test(name)) {
      throw new Error(
        `Invalid function name '${name}'. Function names must match [a-z][a-z0-9-]{0,62}.`,
      );
    }

    const fnDir = join(functionsDir, name);
    const entryPoint = join(fnDir, 'index.mjs');

    if (!existsSync(entryPoint)) {
      throw new Error(
        `Function '${name}' is missing index.mjs entry point.`,
      );
    }

    let config = {};
    const configPath = join(fnDir, 'boa.json');
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    }

    const visibility = config.visibility || 'public';
    if (visibility !== 'public' && visibility !== 'private') {
      throw new Error(
        `Function '${name}': visibility must be 'public' or 'private', got '${visibility}'.`,
      );
    }
    const timeout = config.timeout ?? 30;
    const memory = config.memory ?? 256;
    const env = config.env || {};
    const secrets = config.secrets || [];

    if (timeout < 1 || timeout > 30) {
      throw new Error(
        `Function '${name}': timeout must be between 1 and 30 seconds, got ${timeout}.`,
      );
    }

    if (memory < 128 || memory > 1024) {
      throw new Error(
        `Function '${name}': memory must be between 128 and 1024 MB, got ${memory}.`,
      );
    }

    if (opts.validateSecrets && secrets.length > 0) {
      const stackName = opts.stackName;
      const ssmGetParameter = opts.ssmGetParameter;

      for (const secret of secrets) {
        const paramPath = `/${stackName}/functions/${name}/${secret}`;
        try {
          await ssmGetParameter(paramPath);
        } catch {
          throw new Error(
            `Missing SSM parameter for function '${name}':\n` +
            `  ${paramPath}\n\n` +
            `  Store it with:\n` +
            `  aws ssm put-parameter \\\n` +
            `    --name "${paramPath}" \\\n` +
            `    --value "your-value" \\\n` +
            `    --type String`,
          );
        }
      }
    }

    descriptors.push({
      name,
      visibility,
      timeout,
      memory,
      env,
      secrets,
      path: fnDir,
    });
  }

  return descriptors;
}

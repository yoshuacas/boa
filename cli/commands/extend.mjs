import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as config from '../lib/config.mjs';
import { getRegistry, mergeTemplate } from '../lib/extensions.mjs';
import deploy, { buildDeployConfig } from './deploy.mjs';

export default async function extend(args) {
  const name = args[0];

  if (!name) {
    console.error('Usage: boa extend <name>');
    console.error(
      "Run 'boa extensions' to see available extensions."
    );
    process.exit(1);
  }

  const cfg = config.requireConfig();

  if (name === 'api-gateway') {
    console.log(
      'api-gateway is now the default traffic layer.'
        + ' No action needed.'
    );
    console.log(
      'Run `boa remove alb` if you\'re switching away'
        + ' from ALB.'
    );
    process.exit(0);
  }

  const registry = getRegistry();

  if (!registry[name]) {
    console.error(
      `Error: Unknown extension '${name}'. ` +
      `Run 'boa extensions' to see available extensions.`
    );
    process.exit(1);
  }

  const extensions = cfg.extensions || [];

  if (name === 'alb' && cfg.alb
      && !extensions.includes('alb')) {
    console.log(
      'This project already uses ALB (legacy default).'
    );
    console.log(
      'Adding alb to extensions for explicit tracking...'
    );
    const merged = mergeTemplate(['alb']);
    mkdirSync('.boa', { recursive: true });
    writeFileSync(
      join('.boa', 'template.yaml'), merged
    );
    extensions.push('alb');
    cfg.extensions = extensions;
    config.write(cfg);
    console.log("Extension 'alb' enabled.");
    process.exit(0);
  }

  if (extensions.includes(name)) {
    console.error(
      `Error: Extension '${name}' is already enabled.`
    );
    process.exit(1);
  }

  console.log(`Adding extension '${name}'...`);
  console.log('');

  // Merge template with new extensions list
  const newExtensions = [...extensions, name];
  const merged = mergeTemplate(newExtensions);
  mkdirSync('.boa', { recursive: true });
  writeFileSync(join('.boa', 'template.yaml'), merged);

  // Deploy (uses .boa/template.yaml via resolveTemplate)
  const outputs = await deploy(
    [], { skipConfigWrite: true }
  );
  const updatedCfg = buildDeployConfig(
    cfg, outputs, newExtensions
  );
  config.write(updatedCfg);

  console.log('');
  console.log(`Extension '${name}' enabled.`);
  console.log(`API URL: ${updatedCfg.apiUrl}`);
}

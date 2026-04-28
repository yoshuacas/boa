import {
  existsSync, writeFileSync, unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import * as config from '../lib/config.mjs';
import { mergeTemplate } from '../lib/extensions.mjs';
import deploy, { buildDeployConfig } from './deploy.mjs';

export default async function remove(args) {
  const name = args[0];

  if (!name) {
    console.error('Usage: boa remove <name>');
    process.exit(1);
  }

  const cfg = config.requireConfig();
  const extensions = cfg.extensions || [];

  if (!extensions.includes(name)) {
    console.error(
      `Error: Extension '${name}' is not enabled.`
    );
    process.exit(1);
  }

  console.log(`Removing extension '${name}'...`);
  console.log('');

  // Rebuild template without this extension
  const newExtensions = extensions.filter(e => e !== name);
  if (newExtensions.length > 0) {
    const merged = mergeTemplate(newExtensions);
    writeFileSync(join('.boa', 'template.yaml'), merged);
  } else {
    // No extensions remain — delete merged template
    const mergedPath = join('.boa', 'template.yaml');
    if (existsSync(mergedPath)) unlinkSync(mergedPath);
  }

  // Deploy with updated template
  const outputs = await deploy(
    [], { skipConfigWrite: true }
  );
  const updatedCfg = buildDeployConfig(
    cfg, outputs, newExtensions
  );
  config.write(updatedCfg);

  console.log('');
  console.log(`Extension '${name}' removed.`);
  console.log(`API URL: ${updatedCfg.apiUrl}`);
}

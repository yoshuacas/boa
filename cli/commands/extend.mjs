import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import { getRegistry, mergeTemplate } from '../lib/extensions.mjs';
import deploy from './deploy.mjs';

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
  const registry = getRegistry();

  if (!registry[name]) {
    console.error(
      `Error: Unknown extension '${name}'. ` +
      `Run 'boa extensions' to see available extensions.`
    );
    process.exit(1);
  }

  const extensions = cfg.extensions || [];
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
  await deploy([]);

  // Update config with extension-specific outputs
  const updatedCfg = config.read();
  updatedCfg.extensions = newExtensions;

  // Save the Function URL before overwriting apiUrl
  if (!updatedCfg.functionUrl) {
    updatedCfg.functionUrl = updatedCfg.apiUrl;
  }

  // Extension-specific config updates
  if (name === 'api-gateway') {
    const outputs = aws.cfnDescribeStacks(
      updatedCfg.stackName, updatedCfg.region
    );
    const gatewayUrl = getOutputValue(
      outputs, 'ApiGatewayUrl'
    );
    if (gatewayUrl) {
      updatedCfg.apiUrl = gatewayUrl;
    }
  }

  config.write(updatedCfg);

  console.log('');
  console.log(`Extension '${name}' enabled.`);
  console.log(`API URL: ${updatedCfg.apiUrl}`);
}

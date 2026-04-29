import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as config from '../lib/config.mjs';
import { getRegistry, mergeTemplate } from '../lib/extensions.mjs';
import deploy, { buildDeployConfig } from './deploy.mjs';

function parseExtendArgs(args) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--certificate-arn' && i + 1 < args.length) {
      opts.certificateArn = args[i + 1];
      i++;
    } else {
      positional.push(a);
    }
  }
  return { name: positional[0], opts };
}

export default async function extend(args) {
  const { name, opts } = parseExtendArgs(args);

  if (!name) {
    console.error('Usage: boa extend <name> [options]');
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

  // ALB requires an ACM cert ARN for HTTPS (sec H-1). Check here,
  // after we've ruled out every exit path that should still work
  // without a cert (unknown ext, legacy-already-enabled, etc).
  if (name === 'alb' && !opts.certificateArn) {
    console.error(
      'Error: `boa extend alb` requires --certificate-arn <arn>.'
    );
    console.error('');
    console.error(
      'The ALB extension serves HTTPS end-to-end. Provision an'
    );
    console.error('ACM certificate in the same region first:');
    console.error('');
    console.error(
      '  aws acm request-certificate \\\\'
    );
    console.error(
      '    --domain-name api.yourdomain.com \\\\'
    );
    console.error(
      '    --validation-method DNS --region <region>'
    );
    console.error('');
    console.error(
      'Then re-run with the ARN:'
    );
    console.error(
      '  boa extend alb --certificate-arn arn:aws:acm:...'
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

  // Persist cert ARN so deploy.mjs can forward it to SAM.
  if (opts.certificateArn) {
    cfg.certificateArn = opts.certificateArn;
    cfg.extensions = newExtensions;
    config.write(cfg);
  }

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

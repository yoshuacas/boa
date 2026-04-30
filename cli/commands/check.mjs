import { exit } from 'node:process';
import * as aws from '../lib/aws.mjs';
import { TOOLS, DSQL_REGIONS } from '../lib/constants.mjs';

function platformName() {
  switch (process.platform) {
    case 'darwin': return 'macOS';
    case 'linux':  return 'Linux';
    default:       return process.platform;
  }
}

function extractVersion(output) {
  const match = output.match(/(\d+\.\d+(\.\d+)?)/);
  return match ? match[1] : 'installed';
}

export default async function check(_args) {
  const platform = platformName();
  let exitCode = 0;
  const missing = [];

  console.log(`Platform: ${platform}`);
  console.log('');

  // Check tools
  console.log('Tools:');
  for (const { name, cmd } of TOOLS) {
    try {
      const output = aws.exec(cmd);
      const version = extractVersion(output);
      console.log(`  ${name.padEnd(10)} ${version}`);
    } catch {
      console.log(`  ${name.padEnd(10)} MISSING`);
      missing.push(name);
      exitCode = 1;
    }
  }

  console.log('');

  // Check AWS credentials
  console.log('AWS credentials:');
  try {
    const identity = aws.stsGetCallerIdentity();
    console.log(`  ${'account'.padEnd(10)} ${identity.Account}`);
  } catch {
    console.log(`  ${'status'.padEnd(10)} NOT CONFIGURED`);
    exitCode = 1;
  }

  console.log('');

  // Check region
  console.log('Region:');
  try {
    const region = aws.exec('aws configure get region');
    console.log(`  ${'default'.padEnd(10)} ${region}`);
    if (!DSQL_REGIONS.includes(region)) {
      console.log(
        '  note       Aurora DSQL requires us-east-1 or us-east-2'
      );
    }
  } catch {
    console.log(
      `  ${'default'.padEnd(10)} not set (will need --region flag)`
    );
  }

  // Missing tools summary
  if (missing.length > 0) {
    console.log('');
    console.log(`Missing: ${missing.join(' ')}`);
    if (platform === 'macOS') {
      console.log(
        'Install:  brew install awscli node jq libpq' +
        ' && brew link --force libpq'
      );
    } else {
      console.log('See BOA docs for Linux install commands.');
    }
  }

  exit(exitCode);
}

#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const [,, command, ...args] = argv;

if (command === '--version' || command === '-v') {
  const { version } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  console.log(version);
  exit(0);
}

function printHelp() {
  console.log(`Usage: boa <command> [options]

Commands:
  init <name>       Scaffold project, deploy stack, write config
  deploy            Rebuild and redeploy the stack
  migrate           Apply pending SQL migrations
  verify            Check all stack components
  teardown          Destroy the stack (with confirmation)
  status            Show stack info, tables, pending migrations
  check             Check required tools and AWS credentials
  extend <name>     Add an infrastructure extension
  remove <name>     Remove an infrastructure extension
  extensions        List available extensions
  rotate-keys       Rotate anon and service role keys (90-day lifetime)
  functions         Manage custom functions (list, invoke, logs, remove)
  feedback          Submit feedback to improve BOA

Options:
  --version      Print CLI version
  --help         Show help`);
}

if (command === '--help' || command === '-h' || !command) {
  printHelp();
  exit(0);
}

const COMMANDS = [
  'init', 'deploy', 'migrate', 'verify',
  'teardown', 'status', 'check', 'feedback',
  'extend', 'remove', 'extensions', 'rotate-keys',
  'functions',
];

if (!COMMANDS.includes(command)) {
  console.error(`Unknown command: ${command}`);
  console.error(`Run 'boa --help' for usage.`);
  exit(1);
}

const mod = await import(`../commands/${command}.mjs`);
try {
  await mod.default(args);
} catch (err) {
  if (err && err.isDeployFailure) {
    console.error('');
    console.error(`Deploy failed. CloudFormation rolled the stack back to ${err.stackStatus}.`);
    console.error('Some resources have deletion protection and may still exist in your account.');
    console.error("Run 'boa teardown' to clean up before retrying.");
    exit(1);
  }
  throw err;
}

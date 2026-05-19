import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as config from '../lib/config.mjs';
import { discover } from '../lib/functions/discover.mjs';
import * as aws from '../lib/aws.mjs';

export async function listFunctions({ deployedRegistry, localDescriptors, print }) {
  print('Functions:');
  print('');

  const allNames = new Set([
    ...Object.keys(deployedRegistry),
    ...localDescriptors.map((d) => d.name),
  ]);

  let diverged = false;

  for (const name of [...allNames].sort()) {
    const deployed = deployedRegistry[name];
    const local = localDescriptors.find((d) => d.name === name);

    let visibility = local?.visibility ?? deployed?.visibility ?? 'public';
    let status;

    if (deployed && local) {
      status = 'deployed';
    } else if (deployed && !local) {
      status = 'deployed only';
      diverged = true;
    } else {
      status = 'local only';
      diverged = true;
    }

    print(`  ${name.padEnd(16)}${visibility.padEnd(10)}${status}`);
  }

  if (diverged) {
    print('');
    print("Run 'boa deploy' to sync local changes.");
  }

  return { exitCode: diverged ? 1 : 0 };
}

export async function invokeFn(name, opts) {
  const {
    deployedRegistry,
    lambdaInvoke,
    anonKey,
    serviceRoleKey,
    service = false,
    data,
  } = opts;

  if (!deployedRegistry[name]) {
    const available = Object.keys(deployedRegistry).join(', ');
    throw new Error(
      `Unknown function '${name}'. Available: ${available}`,
    );
  }

  if (data !== undefined) {
    try {
      JSON.parse(data);
    } catch (err) {
      throw new Error(`Invalid JSON in --data: ${err.message}`);
    }
  }

  const apikey = service ? serviceRoleKey : anonKey;
  const body = data !== undefined ? JSON.parse(data) : undefined;

  const payload = {
    httpMethod: 'POST',
    path: `/functions/v1/${name}`,
    headers: { apikey },
    body,
  };

  const result = await lambdaInvoke({
    FunctionName: opts.functionName,
    Payload: JSON.stringify(payload),
  });

  return result;
}

export async function logsFn(name, opts = {}) {
  const { tail = false, stackName, region } = opts;

  const logGroup = `/aws/lambda/${stackName}-functions`;
  const filterPattern = `{ $.function = "${name}" }`;

  if (tail) {
    const cmd = `aws logs tail "${logGroup}" --filter-pattern '${filterPattern}' --follow --region ${region}`;
    aws.execStream(cmd);
  } else {
    const output = aws.exec(
      `aws logs filter-log-events --log-group-name "${logGroup}" `
        + `--filter-pattern '${filterPattern}' `
        + `--region ${region} --output text`,
    );
    console.log(output || '(no logs)');
  }
}

export async function removeFn(name) {
  const functionsDir = join(process.cwd(), 'functions', name);

  if (!existsSync(functionsDir)) {
    console.error(`Error: Function '${name}' not found locally.`);
    process.exit(1);
  }

  console.log(`Removing function '${name}'...`);
  rmSync(functionsDir, { recursive: true });
  console.log(`  Deleted functions/${name}/`);
  console.log("  Run 'boa deploy' to update the deployed stack.");
}

function parseArgs(args) {
  const parsed = { positional: [], flags: {} };
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--service') {
      parsed.flags.service = true;
      i++;
    } else if (args[i] === '--data') {
      parsed.flags.data = args[i + 1];
      i += 2;
    } else if (args[i] === '--tail') {
      parsed.flags.tail = true;
      i++;
    } else if (args[i].startsWith('--')) {
      parsed.flags[args[i].slice(2)] = args[i + 1];
      i += 2;
    } else {
      parsed.positional.push(args[i]);
      i++;
    }
  }
  return parsed;
}

export default async function functions(args) {
  const [action, ...rest] = args;

  switch (action) {
    case 'list': {
      const cfg = config.requireConfig();
      const functionsDir = join(process.cwd(), 'functions');
      const localDescriptors = await discover(functionsDir);

      const deployedRegistry = cfg.functions
        ? Object.fromEntries(
          cfg.functions.map((f) => [f.name, {
            visibility: f.visibility,
            timeout: f.timeout ?? 30,
            memory: f.memory ?? 256,
          }]),
        )
        : {};

      const result = await listFunctions({
        deployedRegistry,
        localDescriptors,
        print: console.log,
      });

      process.exit(result.exitCode);
      break;
    }

    case 'invoke': {
      const parsed = parseArgs(rest);
      const name = parsed.positional[0];
      if (!name) {
        console.error('Usage: boa functions invoke <name> [--service] [--data <json>]');
        process.exit(1);
      }

      const cfg = config.requireConfig();
      const deployedRegistry = cfg.functions
        ? Object.fromEntries(
          cfg.functions.map((f) => [f.name, {
            visibility: f.visibility,
            timeout: f.timeout ?? 30,
            memory: f.memory ?? 256,
          }]),
        )
        : {};

      const result = await invokeFn(name, {
        deployedRegistry,
        lambdaInvoke: (params) => aws.lambdaInvoke(params, cfg.region),
        anonKey: cfg.anonKey,
        serviceRoleKey: cfg.serviceRoleKey,
        service: parsed.flags.service || false,
        data: parsed.flags.data,
        functionName: `${cfg.stackName}-functions`,
      });

      const payload = JSON.parse(result.Payload);
      const body = payload.body ? JSON.parse(payload.body) : payload;
      console.log(JSON.stringify(body, null, 2));
      break;
    }

    case 'logs': {
      const parsed = parseArgs(rest);
      const name = parsed.positional[0];
      if (!name) {
        console.error('Usage: boa functions logs <name> [--tail]');
        process.exit(1);
      }

      const cfg = config.requireConfig();
      await logsFn(name, {
        tail: parsed.flags.tail || false,
        stackName: cfg.stackName,
        region: cfg.region,
      });
      break;
    }

    case 'remove': {
      const name = rest[0];
      if (!name) {
        console.error('Usage: boa functions remove <name>');
        process.exit(1);
      }
      await removeFn(name);
      break;
    }

    default:
      console.error(`Unknown action: ${action}`);
      console.error('Usage: boa functions <list|invoke|logs|remove>');
      process.exit(1);
  }
}

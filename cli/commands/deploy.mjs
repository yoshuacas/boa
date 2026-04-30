import {
  existsSync, readdirSync,
  mkdirSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as deployLib from '../lib/deploy.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import {
  resolveTemplate, mergeTemplate,
} from '../lib/extensions.mjs';
import { ensureLambdaDepsInstalled } from '../lib/lambda-deps.mjs';
import { getPinnedPgrestLambdaVersion } from '../lib/lambda-deps.mjs';
import { copySkill } from '../lib/skill.mjs';
import { bootstrapBetterAuthSchema } from '../lib/auth-schema.mjs';
import { runTasks, heading, warn, summary, blank, color, sym } from '../lib/ui.mjs';

export function needsMigrationWarning(cfg) {
  const extensions = cfg.extensions || [];
  if (cfg.alb && !extensions.includes('alb')) {
    return 'This project uses ALB as the traffic layer'
      + ' (legacy default). Keeping ALB.';
  }
  if (cfg.cloudfront && !cfg.apiGateway) {
    return 'This version of BOA uses API Gateway REST'
      + ' + WAF by default instead of CloudFront.';
  }
  if (cfg.apiUrl
      && cfg.apiUrl.includes('lambda-url.')
      && !cfg.apiGateway) {
    return 'This version of BOA uses API Gateway REST'
      + ' + WAF by default.';
  }
  return null;
}

export function buildDeployConfig(cfg, outputs, extensions) {
  const apiGatewayUrl = getOutputValue(
    outputs, 'ApiGatewayUrl'
  );
  const restApiId = getOutputValue(outputs, 'RestApiId');
  const bucketName = getOutputValue(outputs, 'BucketName');
  const dsqlEndpoint = getOutputValue(
    outputs, 'DsqlEndpoint'
  );

  const filtered = extensions.filter(
    e => e !== 'api-gateway'
  );
  const result = {
    stackName: cfg.stackName,
    region: cfg.region,
    accountId: cfg.accountId,
    apiUrl: apiGatewayUrl,
    apiGateway: restApiId ? {
      restApiId,
      stage: 'prod',
    } : undefined,
    anonKey: cfg.anonKey,
    serviceRoleKey: cfg.serviceRoleKey,
    authProvider: cfg.authProvider || 'better-auth',
    pgrestLambdaVersion: getPinnedPgrestLambdaVersion(),
    bucketName,
    dsqlEndpoint,
    deployedAt: new Date().toISOString(),
    extensions: filtered,
  };

  if (Array.isArray(cfg.allowedOrigins) && cfg.allowedOrigins.length > 0) {
    result.allowedOrigins = cfg.allowedOrigins;
  }
  if (cfg.certificateArn) {
    result.certificateArn = cfg.certificateArn;
  }

  if (filtered.includes('alb')) {
    const albUrl = getOutputValue(outputs, 'AlbUrl');
    const albArn = getOutputValue(outputs, 'AlbArn');
    const targetGroupArn = getOutputValue(
      outputs, 'TargetGroupArn'
    );
    const vpcId = getOutputValue(outputs, 'VpcId');
    if (albUrl) result.apiUrl = albUrl;
    result.alb = (albArn && albUrl) ? {
      arn: albArn,
      dnsName: new URL(albUrl).hostname,
      targetGroupArn,
      vpcId,
    } : undefined;
    delete result.apiGateway;
  }

  return result;
}

// Concepts the stack-progress UI can report on. Listed up-front so
// the task tree shows them in a stable order (pending -> running ->
// done) as CloudFormation events arrive, rather than popping in
// only when they first appear. Keyed by extension so we don't
// surface concepts that won't participate in this deploy.
function conceptsForExtensions(extensions) {
  const base = ['Database', 'File storage', 'API', 'Firewall'];
  if (extensions.includes('alb')) base.push('Load balancer');
  return base;
}

export default async function deploy(_args, opts = {}) {
  const cfg = config.requireConfig();
  const { stackName, region } = cfg;

  heading(`Deploying ${color.bold(stackName)} to ${region}`);
  blank();

  const migration = needsMigrationWarning(cfg);
  if (migration) {
    warn(migration);
    warn('Your API URL will change. Update your frontend config after deploy.');
    blank();
  }

  // Legacy ALB detection — MUST happen before resolveTemplate().
  const extensions = cfg.extensions || [];
  if (cfg.alb && !extensions.includes('alb')) {
    warn('Adding alb to extensions for explicit tracking.');
    const merged = mergeTemplate(['alb']);
    mkdirSync(join(process.cwd(), '.boa'), { recursive: true });
    writeFileSync(
      join(process.cwd(), '.boa', 'template.yaml'), merged
    );
    extensions.push('alb');
  }

  const templatePath = resolveTemplate(process.cwd());

  // Shared state across tasks. Using a single object so each task
  // can hand the next what it produced (lambdaKey, outputs, ...).
  const state = { cfg, stackName, region, extensions, templatePath };

  await runTasks([
    {
      title: 'Check Lambda dependencies',
      run: () => { ensureLambdaDepsInstalled(); },
    },
    {
      title: 'Preparing REST API, authentication, and authorization runtime',
      run: async (_ctx, t) => {
        t.update('bundling the serverless runtime and uploading it to S3…');
        const { lambdaKey, accountId } = deployLib.packageArtifacts({
          projectDir: process.cwd(),
          templatePath,
          region,
          stackName,
        });
        state.lambdaKey = lambdaKey;
        state.accountId = accountId;
        state.templateUrl = deployLib.uploadTemplate({
          templatePath,
          bucket: deployLib.artifactsBucketName(accountId, region),
          region,
          stackName,
        });
      },
    },
    {
      title: 'Deploy stack',
      run: async (_ctx, parent) => {
        const parameters = {
          ProjectName: stackName,
          LambdaS3Bucket: deployLib.artifactsBucketName(state.accountId, region),
          LambdaS3Key: state.lambdaKey,
        };
        if (Array.isArray(cfg.allowedOrigins) && cfg.allowedOrigins.length > 0) {
          parameters.AllowedOrigins = cfg.allowedOrigins.join(',');
        }
        if (cfg.certificateArn) {
          parameters.CertificateArn = cfg.certificateArn;
        }

        // Create listr2 subtasks lazily as concepts arrive. We pre-
        // allocate tasks for the known concepts so they show up in
        // a stable order as CloudFormation events stream in.
        const sub = new Map();
        const waiters = new Map();

        const makeSub = (name) => {
          if (sub.has(name)) return;
          let resolveStart;
          const startPromise = new Promise((r) => { resolveStart = r; });
          let resolveEnd, rejectEnd;
          const endPromise = new Promise((res, rej) => {
            resolveEnd = res; rejectEnd = rej;
          });
          sub.set(name, {
            title: name,
            run: async () => {
              await startPromise;    // wait until we see the concept go in_progress
              await endPromise;      // wait for it to complete or fail
            },
          });
          waiters.set(name, { resolveStart, resolveEnd, rejectEnd });
        };

        for (const name of conceptsForExtensions(extensions)) makeSub(name);

        // The `onEvent` hook drives the subtask states.
        const handleEvent = (name, state, reason) => {
          makeSub(name);
          const w = waiters.get(name);
          if (!w) return;
          if (state === 'in_progress') w.resolveStart();
          else if (state === 'complete') { w.resolveStart(); w.resolveEnd(); }
          else if (state === 'failed') {
            w.resolveStart();
            w.rejectEnd(new Error(`${name} failed: ${reason}`));
          }
        };

        // deployStack is CPU-synchronous (it busy-waits on a CFN
        // poll loop), so we hand it to setImmediate to release the
        // event loop. That lets listr2 paint the subtasks and lets
        // the onEvent callback drive them as concepts report back.
        const deployPromise = new Promise((resolve, reject) => {
          setImmediate(() => {
            try {
              deployLib.deployStack({
                stackName, region,
                templateUrl: state.templateUrl,
                parameters,
                onEvent: handleEvent,
              });
              // A no-op update emits no events — resolve any
              // subtasks still waiting so they don't hang.
              for (const w of waiters.values()) {
                w.resolveStart();
                w.resolveEnd();
              }
              resolve();
            } catch (err) {
              for (const w of waiters.values()) w.rejectEnd(err);
              reject(err);
            }
          });
        });

        // Attach an invisible awaiter subtask that gates the parent
        // task on the real deploy promise. Without it listr2 would
        // resolve this task as soon as the concept subtasks all
        // reach 'complete', which can happen slightly before
        // deployStack returns.
        const subtasks = [...sub.values()];
        subtasks.push({
          title: 'Wait for CloudFormation',
          run: () => deployPromise,
        });
        return subtasks;
      },
    },
    {
      title: 'Read stack outputs',
      run: () => {
        state.outputs = aws.cfnDescribeStacks(stackName, region);
      },
    },
    {
      title: 'Ensure auth schema',
      skip: () => (cfg.authProvider || 'better-auth') !== 'better-auth'
        ? 'auth provider is not better-auth' : false,
      run: () => {
        const dsqlEndpoint = getOutputValue(state.outputs, 'DsqlEndpoint');
        bootstrapBetterAuthSchema(dsqlEndpoint, region);
      },
    },
    {
      title: 'Write configuration',
      skip: () => opts.skipConfigWrite ? 'opts.skipConfigWrite' : false,
      run: () => {
        const updated = buildDeployConfig(cfg, state.outputs, extensions);
        state.updatedConfig = updated;
        config.write(updated);
        copySkill(process.cwd());
      },
    },
    {
      title: 'Apply database migrations',
      skip: () => {
        const dir = join(process.cwd(), 'migrations');
        if (!existsSync(dir)) return 'no migrations/ directory';
        const sql = readdirSync(dir).filter((f) => f.endsWith('.sql'));
        return sql.length === 0 ? 'no .sql files' : false;
      },
      run: async () => {
        const migrate = await import('./migrate.mjs');
        await migrate.default([]);
      },
    },
  ]);

  if (opts.skipConfigWrite) {
    return state.outputs;
  }

  const c = state.updatedConfig;
  summary('Deployment complete', [
    ['API URL', c.apiUrl],
    ['Stack', c.stackName],
    ['Region', c.region],
    ['Auth', c.authProvider],
    ['Storage', c.bucketName],
    ['Database', c.dsqlEndpoint],
  ]);
  blank();
  console.log(`  ${sym.arrow} Next: add tables in ${color.cyan('migrations/')} and policies in ${color.cyan('policies/')}, then run ${color.bold('boa deploy')}.`);
}

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import { buildStudio } from '../lib/studio-build.mjs';
import { runTasks, heading, summary, blank, color, sym, ok, fail } from '../lib/ui.mjs';

const PHASE1_TEMPLATE = fileURLToPath(new URL('../templates/studio-infra.yaml', import.meta.url));
const PHASE2_TEMPLATE = fileURLToPath(new URL('../templates/studio-infra-app.yaml', import.meta.url));

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === '--repo'           && i + 1 < args.length) opts.repo          = args[++i];
    else if (a === '--branch'         && i + 1 < args.length) opts.branch        = args[++i];
    else if (a === '--auth-mode'      && i + 1 < args.length) opts.authMode      = args[++i];
    else if (a === '--session-secret' && i + 1 < args.length) opts.sessionSecret = args[++i];
    else if (a === '--access-token'   && i + 1 < args.length) opts.accessToken   = args[++i];
  }
  return opts;
}

function lambdaS3Key() {
  return `studio-lambda-${Date.now()}.zip`;
}

async function dev(args) {
  // Resolve project directory from --project flag or current working directory
  let projectDir = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && i + 1 < args.length) {
      projectDir = resolvePath(args[++i]);
    }
  }

  const configPath = join(projectDir, '.boa', 'config.json');
  if (!existsSync(configPath)) {
    console.error(`Error: No .boa/config.json found at ${configPath}`);
    console.error('  Run from inside a BOA project or pass --project <path>');
    process.exit(1);
  }

  // Studio source is adjacent to cli/ in the repo
  const studioDir = fileURLToPath(new URL('../../studio', import.meta.url));
  const lambdaOut = join(studioDir, '.lambda', 'index.mjs');
  const devServerScript = fileURLToPath(new URL('../lib/studio-dev-server.mjs', import.meta.url));
  const apiPort = 3099;

  heading('BOA Studio — local dev');
  blank();
  console.log(`  ${sym.arrow} Project: ${configPath}`);
  blank();

  // Build the Lambda handler
  console.log(`  ${sym.arrow} Building Lambda handler ...`);
  execSync('npm run build:lambda', { cwd: studioDir, stdio: 'inherit' });
  blank();

  // Start the local API server
  const serverProc = spawn('node', [devServerScript, lambdaOut, String(apiPort)], {
    env: {
      ...process.env,
      STUDIO_MODE: 'local',
      NODE_ENV: 'development',
      BOA_CONFIG_PATH: configPath,
    },
    stdio: 'inherit',
  });

  // Give the API server a moment to bind, then start Vite
  await new Promise((r) => setTimeout(r, 300));

  console.log(`  ${sym.arrow} Starting Vite dev server ...`);
  blank();

  const viteProc = spawn('npm', ['run', 'dev'], {
    cwd: studioDir,
    env: {
      ...process.env,
      BOA_API_PORT: String(apiPort),
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  // Forward SIGINT (Ctrl+C) to both child processes
  process.on('SIGINT', () => {
    serverProc.kill('SIGINT');
    viteProc.kill('SIGINT');
    process.exit(0);
  });

  // Exit if either child dies unexpectedly
  serverProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n[studio api] exited with code ${code}`);
      viteProc.kill();
      process.exit(code);
    }
  });

  viteProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n[studio vite] exited with code ${code}`);
      serverProc.kill();
      process.exit(code);
    }
  });
}

async function deploy(args) {
  const opts = parseArgs(args);
  const cfg  = config.requireConfig();
  const { stackName, region } = cfg;

  if (cfg.studio?.distributionId) {
    console.error('Error: BOA Studio is already deployed for this project.');
    console.error("  Run 'boa studio remove' first if you want to redeploy.");
    process.exit(1);
  }

  const branch        = opts.branch        || 'main';
  const authMode      = opts.authMode      || 'token';
  const sessionSecret = opts.sessionSecret || randomBytes(32).toString('hex');
  const accessToken   = opts.accessToken   || (authMode === 'token' ? randomBytes(24).toString('hex') : '');
  const phase1Stack   = `boa-studio-${stackName}`;
  const phase2Stack   = `boa-studio-app-${stackName}`;

  const state = {};

  heading(`Deploying BOA Studio for ${color.bold(stackName)}`);
  blank();

  // Write SSM config
  aws.ssmPutParameter(`/${stackName}/studio-config`, JSON.stringify(cfg), region);
  ok('Backend config written to SSM');

  // ── Phase 1: IAM + Cognito + S3 ─────────────────────────────
  // Run CFN outside of listr2 — it has its own progress output.
  console.log(`\n  ${sym.arrow} Deploying Phase 1 stack (IAM, Cognito, S3)...`);
  const p1Params = [
    `BoaStackName=${stackName}`,
    `AuthMode=${authMode}`,
  ].map((p) => aws.shellEscape(p)).join(' ');

  aws.run(
    `aws cloudformation deploy` +
    ` --stack-name ${aws.shellEscape(phase1Stack)}` +
    ` --template-file ${aws.shellEscape(PHASE1_TEMPLATE)}` +
    ` --parameter-overrides ${p1Params}` +
    ` --capabilities CAPABILITY_NAMED_IAM` +
    ` --region ${aws.shellEscape(region)}`
  );

  // Read Phase 1 outputs
  const p1Outputs       = aws.cfnDescribeStacks(phase1Stack, region);
  state.lambdaRoleArn   = getOutputValue(p1Outputs, 'LambdaRoleArn');
  state.artifactsBucket = getOutputValue(p1Outputs, 'ArtifactsBucketName');
  state.staticBucket    = getOutputValue(p1Outputs, 'StaticBucketName');
  state.cognitoPoolId   = getOutputValue(p1Outputs, 'CognitoUserPoolId') || '';
  state.cognitoClientId = getOutputValue(p1Outputs, 'CognitoClientId') || '';

  // ── Build ────────────────────────────────────────────────────
  blank();
  console.log(`  ${sym.arrow} Building BOA Studio (this takes a few minutes)...`);
  blank();

  const build = await buildStudio({
    repo:              opts.repo,
    ref:               branch,
    authMode,
    cognitoRegion:     authMode === 'cognito' ? region : undefined,
    cognitoUserPoolId: state.cognitoPoolId  || undefined,
    cognitoClientId:   state.cognitoClientId || undefined,
  });

  // ── Phase 2: Upload + Lambda + CloudFront ────────────────────
  blank();
  await runTasks([
    {
      title: 'Upload Lambda zip to S3',
      run: () => {
        state.lambdaS3Key = lambdaS3Key();
        aws.exec(
          `aws s3 cp ${aws.shellEscape(build.lambdaZip)}` +
          ` s3://${aws.shellEscape(state.artifactsBucket)}/${aws.shellEscape(state.lambdaS3Key)}` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Sync SPA to S3',
      run: () => {
        aws.exec(
          `aws s3 sync ${aws.shellEscape(build.spaDir)}` +
          ` s3://${aws.shellEscape(state.staticBucket)}` +
          ` --delete --region ${aws.shellEscape(region)}`
        );
      },
    },
  ]);

  // ── Phase 2: Lambda + API Gateway + CloudFront ───────────────
  // Run CFN outside of listr2 — it has its own progress output.
  console.log(`\n  ${sym.arrow} Deploying Phase 2 stack (Lambda, CloudFront)...`);
  const p2Params = [
    `BoaStackName=${stackName}`,
    `LambdaRoleArn=${state.lambdaRoleArn}`,
    `ArtifactsBucket=${state.artifactsBucket}`,
    `LambdaS3Key=${state.lambdaS3Key}`,
    `StaticBucket=${state.staticBucket}`,
    `AuthMode=${authMode}`,
    `SessionSecret=${sessionSecret}`,
    `AccessToken=${accessToken}`,
    ...(state.cognitoPoolId   ? [`CognitoUserPoolId=${state.cognitoPoolId}`]   : []),
    ...(state.cognitoClientId ? [`CognitoClientId=${state.cognitoClientId}`]   : []),
  ].map((p) => aws.shellEscape(p)).join(' ');

  aws.run(
    `aws cloudformation deploy` +
    ` --stack-name ${aws.shellEscape(phase2Stack)}` +
    ` --template-file ${aws.shellEscape(PHASE2_TEMPLATE)}` +
    ` --parameter-overrides ${p2Params}` +
    ` --region ${aws.shellEscape(region)}`
  );

  // Read Phase 2 outputs and save config
  const p2Outputs          = aws.cfnDescribeStacks(phase2Stack, region);
  state.studioUrl          = getOutputValue(p2Outputs, 'StudioUrl');
  state.distributionId     = getOutputValue(p2Outputs, 'DistributionId');
  state.lambdaFunctionName = getOutputValue(p2Outputs, 'LambdaFunctionName');
  state.apiId              = getOutputValue(p2Outputs, 'ApiId');

  cfg.studio = {
    phase1Stack,
    phase2Stack,
    studioUrl:           state.studioUrl,
    distributionId:      state.distributionId,
    lambdaFunctionName:  state.lambdaFunctionName,
    apiId:               state.apiId,
    artifactsBucket:     state.artifactsBucket,
    staticBucket:        state.staticBucket,
    authMode,
    branch,
    repo:                opts.repo || undefined,
  };
  config.write(cfg);
  ok('Studio configuration saved');

  build.cleanup();

  summary('BOA Studio deployed', [
    ['Studio URL', state.studioUrl],
    ['Auth mode',  authMode],
    ['Stack',      phase2Stack],
  ]);

  if (authMode === 'cognito') {
    blank();
    console.log(`  ${sym.info} No admin users exist yet. Create the first one:`);
    blank();
    const email = await prompt('  Admin email address: ');
    if (email) {
      const tempPassword = randomBytes(12).toString('hex').slice(0, 16) + 'Aa1!';
      aws.exec(
        `aws cognito-idp admin-create-user` +
        ` --user-pool-id ${aws.shellEscape(state.cognitoPoolId)}` +
        ` --username ${aws.shellEscape(email)}` +
        ` --temporary-password ${aws.shellEscape(tempPassword)}` +
        ` --user-attributes Name=email,Value=${aws.shellEscape(email)} Name=email_verified,Value=true` +
        ` --region ${aws.shellEscape(region)}`
      );
      ok(`Admin user created: ${email}`);
      blank();
      console.log(`  Temporary password: ${color.bold(tempPassword)}`);
      console.log(`  You will be prompted to change it on first login.`);
    }
  } else {
    blank();
    console.log(`  ${sym.info} Access token stored in SSM at /${stackName}/studio-config`);
  }
}

async function update(args) {
  const opts = parseArgs(args);
  const cfg = config.requireConfig();
  const { stackName, region } = cfg;

  if (!cfg.studio?.distributionId) {
    console.error("Error: BOA Studio is not deployed. Run 'boa studio deploy' first.");
    process.exit(1);
  }

  const {
    phase1Stack,
    lambdaFunctionName,
    artifactsBucket,
    staticBucket,
    distributionId,
    authMode = 'token',
    branch: savedBranch = 'main',
    repo: savedRepo,
  } = cfg.studio;

  const branch = opts.branch || savedBranch;
  const repo   = opts.repo   || savedRepo;

  heading(`Updating BOA Studio for ${color.bold(stackName)}`);
  blank();

  // Refresh SSM config
  aws.ssmPutParameter(`/${stackName}/studio-config`, JSON.stringify(cfg), region);
  ok('Backend config refreshed in SSM');

  // Read Cognito IDs if needed
  let cognitoPoolId, cognitoClientId;
  if (authMode === 'cognito') {
    const p1Outputs = aws.cfnDescribeStacks(phase1Stack, region);
    cognitoPoolId   = getOutputValue(p1Outputs, 'CognitoUserPoolId') || '';
    cognitoClientId = getOutputValue(p1Outputs, 'CognitoClientId') || '';
  }

  blank();
  console.log(`  ${sym.arrow} Building BOA Studio (this takes a few minutes)...`);
  blank();

  const build = await buildStudio({
    repo,
    ref:               branch,
    authMode,
    cognitoRegion:     authMode === 'cognito' ? region : undefined,
    cognitoUserPoolId: cognitoPoolId,
    cognitoClientId,
  });

  const state = {};

  await runTasks([
    {
      title: 'Upload Lambda zip to S3',
      run: () => {
        state.lambdaS3Key = lambdaS3Key();
        aws.exec(
          `aws s3 cp ${aws.shellEscape(build.lambdaZip)}` +
          ` s3://${aws.shellEscape(artifactsBucket)}/${aws.shellEscape(state.lambdaS3Key)}` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Update Lambda function code',
      run: () => {
        aws.exec(
          `aws lambda update-function-code` +
          ` --function-name ${aws.shellEscape(lambdaFunctionName)}` +
          ` --s3-bucket ${aws.shellEscape(artifactsBucket)}` +
          ` --s3-key ${aws.shellEscape(state.lambdaS3Key)}` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Sync SPA to S3',
      run: () => {
        aws.exec(
          `aws s3 sync ${aws.shellEscape(build.spaDir)}` +
          ` s3://${aws.shellEscape(staticBucket)}` +
          ` --delete --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Invalidate CloudFront cache',
      run: () => {
        aws.exec(
          `aws cloudfront create-invalidation` +
          ` --distribution-id ${aws.shellEscape(distributionId)}` +
          ` --paths '/*'` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
  ]);

  build.cleanup();

  blank();
  ok(`Studio updated at ${cfg.studio.studioUrl}`);
}

async function remove(_args) {
  if (!process.stdin.isTTY) {
    console.error('Error: boa studio remove must be run interactively from a terminal.');
    console.error('This is a destructive operation that requires human confirmation.');
    process.exit(1);
  }

  const cfg = config.requireConfig();
  const { stackName, region } = cfg;

  if (!cfg.studio) {
    console.error('Error: BOA Studio is not deployed for this project. Nothing to remove.');
    process.exit(1);
  }

  const { phase1Stack, phase2Stack, authMode, artifactsBucket, staticBucket } = cfg.studio;

  console.log('');
  console.log('This will permanently delete:');
  console.log(`  • CloudFront distribution and Lambda function`);
  console.log(`  • S3 buckets: ${artifactsBucket}, ${staticBucket}`);
  if (authMode === 'cognito') {
    console.log(`  • Cognito user pool (studio admin accounts)`);
  }
  console.log(`  • CloudFormation stacks: ${phase2Stack}, ${phase1Stack}`);
  console.log('');
  console.log('Your BOA backend (database, auth, API) is NOT affected.');
  console.log('');

  const answer = await prompt(`Type the stack name to confirm [${phase2Stack}]: `);
  if (answer !== phase2Stack) {
    console.log(`Remove cancelled. You typed '${answer}' but expected '${phase2Stack}'.`);
    process.exit(0);
  }

  console.log('');

  // Empty S3 buckets (CFN cannot delete non-empty buckets)
  for (const bucket of [staticBucket, artifactsBucket]) {
    if (!bucket) continue;
    console.log(`Emptying S3 bucket '${bucket}'...`);
    aws.exec(`aws s3 rm s3://${aws.shellEscape(bucket)} --recursive --region ${aws.shellEscape(region)}`);
    ok(`Bucket '${bucket}' emptied`);
  }

  // Delete Phase 2 first (CloudFront, Lambda)
  console.log(`Deleting stack '${phase2Stack}'...`);
  aws.exec(
    `aws cloudformation delete-stack` +
    ` --stack-name ${aws.shellEscape(phase2Stack)}` +
    ` --region ${aws.shellEscape(region)}`
  );
  await pollStackDeletion(phase2Stack, region);
  ok(`Stack '${phase2Stack}' deleted`);

  // Delete Phase 1 (IAM, Cognito, S3)
  console.log(`Deleting stack '${phase1Stack}'...`);
  aws.exec(
    `aws cloudformation delete-stack` +
    ` --stack-name ${aws.shellEscape(phase1Stack)}` +
    ` --region ${aws.shellEscape(region)}`
  );
  await pollStackDeletion(phase1Stack, region);
  ok(`Stack '${phase1Stack}' deleted`);

  delete cfg.studio;
  config.write(cfg);
  ok('Studio configuration removed from .boa/config.json');

  console.log('');
  console.log(`BOA Studio removed. Your backend at ${cfg.apiUrl} is unaffected.`);
}

async function pollStackDeletion(stackName, region) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    try {
      const status = aws.exec(
        `aws cloudformation describe-stacks` +
        ` --stack-name ${aws.shellEscape(stackName)}` +
        ` --region ${aws.shellEscape(region)}` +
        ` --query 'Stacks[0].StackStatus' --output text`
      ).trim();
      if (status === 'DELETE_FAILED') {
        fail(`Stack deletion failed (status: DELETE_FAILED).`);
        console.error(`  Check the CloudFormation console for details.`);
        process.exit(1);
      }
      process.stdout.write('.');
    } catch {
      return; // describe-stacks throws when stack no longer exists
    }
  }
  fail('Stack deletion timed out. Check the CloudFormation console.');
  process.exit(1);
}

export default async function studio(args) {
  const [sub, ...rest] = args;

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`Usage: boa studio <subcommand> [options]

Subcommands:
  dev       Run Studio locally against a project's .boa/config.json
  deploy    Deploy BOA Studio for this project
  update    Rebuild and redeploy Studio
  remove    Remove Studio from this project

Options for dev:
  --project <path>       Path to BOA project directory (default: current dir)

Options for deploy:
  --branch <branch>      Branch to build from (default: main)
  --auth-mode <mode>     Auth mode: token or cognito (default: token)
  --session-secret <s>   Session cookie secret (auto-generated if omitted)
  --access-token <t>     Access token for token mode (auto-generated if omitted)
  --repo <owner/repo>    GitHub repo to build from (default: yoshuacas/boa)`);
    process.exit(0);
  }

  switch (sub) {
    case 'dev':    return dev(rest);
    case 'deploy': return deploy(rest);
    case 'update': return update(rest);
    case 'remove': return remove(rest);
    default:
      console.error(`Unknown subcommand: ${sub}`);
      console.error("Run 'boa studio --help' for usage.");
      process.exit(1);
  }
}

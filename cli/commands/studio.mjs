import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
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

function parseDeployArgs(args) {
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

async function deploy(args) {
  const opts = parseDeployArgs(args);
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

  // ── Phase 1: IAM + Cognito + S3 ─────────────────────────────
  await runTasks([
    {
      title: 'Write backend config to SSM',
      run: () => {
        aws.ssmPutParameter(`/${stackName}/studio-config`, JSON.stringify(cfg), region);
      },
    },
    {
      title: 'Deploy Phase 1 stack (IAM, Cognito, S3)',
      run: () => {
        const params = [
          `BoaStackName=${stackName}`,
          `AuthMode=${authMode}`,
        ].map((p) => aws.shellEscape(p)).join(' ');

        aws.run(
          `aws cloudformation deploy` +
          ` --stack-name ${aws.shellEscape(phase1Stack)}` +
          ` --template-file ${aws.shellEscape(PHASE1_TEMPLATE)}` +
          ` --parameter-overrides ${params}` +
          ` --capabilities CAPABILITY_NAMED_IAM` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Read Phase 1 outputs',
      run: () => {
        const outputs         = aws.cfnDescribeStacks(phase1Stack, region);
        state.lambdaRoleArn   = getOutputValue(outputs, 'LambdaRoleArn');
        state.artifactsBucket = getOutputValue(outputs, 'ArtifactsBucketName');
        state.staticBucket    = getOutputValue(outputs, 'StaticBucketName');
        state.cognitoPoolId   = getOutputValue(outputs, 'CognitoUserPoolId') || '';
        state.cognitoClientId = getOutputValue(outputs, 'CognitoClientId') || '';
      },
    },
  ]);

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
      title: 'Sync static assets to S3',
      run: () => {
        aws.exec(
          `aws s3 sync ${aws.shellEscape(build.assetsDir)}` +
          ` s3://${aws.shellEscape(state.staticBucket)}` +
          ` --delete --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Deploy Phase 2 stack (Lambda, CloudFront)',
      run: () => {
        const params = [
          `BoaStackName=${stackName}`,
          `LambdaRoleArn=${state.lambdaRoleArn}`,
          `ArtifactsBucket=${state.artifactsBucket}`,
          `LambdaS3Key=${state.lambdaS3Key}`,
          `StaticBucket=${state.staticBucket}`,
          `AuthMode=${authMode}`,
          `SessionSecret=${sessionSecret}`,
          `AccessToken=${accessToken}`,
          ...(state.cognitoPoolId   ? [`CognitoUserPoolId=${state.cognitoPoolId}`]   : []),
          ...(state.cognitoClientId ? [`CognitoClientId=${state.cognitoClientId}`] : []),
        ].map((p) => aws.shellEscape(p)).join(' ');

        aws.run(
          `aws cloudformation deploy` +
          ` --stack-name ${aws.shellEscape(phase2Stack)}` +
          ` --template-file ${aws.shellEscape(PHASE2_TEMPLATE)}` +
          ` --parameter-overrides ${params}` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Read Phase 2 outputs',
      run: () => {
        const outputs            = aws.cfnDescribeStacks(phase2Stack, region);
        state.studioUrl          = getOutputValue(outputs, 'StudioUrl');
        state.distributionId     = getOutputValue(outputs, 'DistributionId');
        state.lambdaFunctionName = getOutputValue(outputs, 'LambdaFunctionName');
      },
    },
    {
      title: 'Save Studio configuration',
      run: () => {
        cfg.studio = {
          phase1Stack,
          phase2Stack,
          studioUrl:           state.studioUrl,
          distributionId:      state.distributionId,
          lambdaFunctionName:  state.lambdaFunctionName,
          artifactsBucket:     state.artifactsBucket,
          staticBucket:        state.staticBucket,
          authMode,
          branch,
        };
        config.write(cfg);
      },
    },
  ]);

  build.cleanup();

  summary('BOA Studio deployed', [
    ['Studio URL', state.studioUrl],
    ['Auth mode',  authMode],
    ['Stack',      phase2Stack],
  ]);

  if (authMode === 'token') {
    blank();
    console.log(`  ${sym.info} Access token stored in SSM at /${stackName}/studio-config`);
  }
}

async function update(_args) {
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
    branch = 'main',
  } = cfg.studio;

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
    ref: branch,
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
      title: 'Sync static assets to S3',
      run: () => {
        aws.exec(
          `aws s3 sync ${aws.shellEscape(build.assetsDir)}` +
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
  deploy    Deploy BOA Studio for this project
  update    Rebuild and redeploy Studio
  remove    Remove Studio from this project

Options for deploy:
  --branch <branch>      Branch to build from (default: main)
  --auth-mode <mode>     Auth mode: token or cognito (default: token)
  --session-secret <s>   Session cookie secret (auto-generated if omitted)
  --access-token <t>     Access token for token mode (auto-generated if omitted)
  --repo <owner/repo>    GitHub repo to build from (default: yoshuacas/boa)`);
    process.exit(0);
  }

  switch (sub) {
    case 'deploy': return deploy(rest);
    case 'update': return update(rest);
    case 'remove': return remove(rest);
    default:
      console.error(`Unknown subcommand: ${sub}`);
      console.error("Run 'boa studio --help' for usage.");
      process.exit(1);
  }
}

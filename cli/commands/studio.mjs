import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import { runTasks, heading, summary, blank, color, sym, ok, fail } from '../lib/ui.mjs';

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
    if (a === '--repo' && i + 1 < args.length) opts.repo = args[++i];
    else if (a === '--token' && i + 1 < args.length) opts.token = args[++i];
    else if (a === '--branch' && i + 1 < args.length) opts.branch = args[++i];
    else if (a === '--auth-mode' && i + 1 < args.length) opts.authMode = args[++i];
    else if (a === '--session-secret' && i + 1 < args.length) opts.sessionSecret = args[++i];
    else if (a === '--access-token' && i + 1 < args.length) opts.accessToken = args[++i];
  }
  return opts;
}

async function deploy(args) {
  const opts = parseDeployArgs(args);
  const cfg = config.requireConfig();
  const { stackName, region } = cfg;

  if (!opts.repo) {
    console.error('Error: --repo <url> is required');
    console.error('  Example: boa studio deploy --repo https://github.com/org/repo');
    process.exit(1);
  }

  const branch = opts.branch || 'main';
  const authMode = opts.authMode || 'token';
  const sessionSecret = opts.sessionSecret || randomBytes(32).toString('hex');
  const accessToken = opts.accessToken
    || (authMode === 'token' ? randomBytes(24).toString('hex') : '');
  const studioStackName = `boa-studio-${stackName}`;
  const templatePath = fileURLToPath(
    new URL('../templates/studio-infra.yaml', import.meta.url)
  );

  const state = {};

  heading(`Deploying BOA Studio for ${color.bold(stackName)}`);
  blank();

  await runTasks([
    {
      title: 'Write backend config to SSM',
      run: () => {
        aws.ssmPutParameter(
          `/${stackName}/studio-config`,
          JSON.stringify(cfg),
          region
        );
      },
    },
    {
      title: 'Deploy Studio infrastructure',
      run: () => {
        const paramOverrides = [
          `BoaStackName=${stackName}`,
          `AuthMode=${authMode}`,
          `SessionSecret=${sessionSecret}`,
          `AccessToken=${accessToken}`,
          `GitHubRepo=${opts.repo}`,
          `GitHubToken=${opts.token || ''}`,
          `GitBranch=${branch}`,
        ].map((p) => aws.shellEscape(p)).join(' ');

        aws.run(
          `aws cloudformation deploy` +
          ` --stack-name ${aws.shellEscape(studioStackName)}` +
          ` --template-file ${aws.shellEscape(templatePath)}` +
          ` --parameter-overrides ${paramOverrides}` +
          ` --capabilities CAPABILITY_NAMED_IAM` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Read stack outputs',
      run: () => {
        state.outputs = aws.cfnDescribeStacks(studioStackName, region);
        state.appId = getOutputValue(state.outputs, 'AmplifyAppId');
        state.roleArn = getOutputValue(state.outputs, 'AmplifyRoleArn');
        state.studioUrl = getOutputValue(state.outputs, 'AmplifyDefaultDomain');
      },
    },
    {
      title: 'Configure Amplify app root',
      run: () => {
        aws.exec(
          `aws amplify update-app --app-id ${aws.shellEscape(state.appId)}` +
          ` --app-root studio` +
          ` --compute-role-arn ${aws.shellEscape(state.roleArn)}` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Trigger initial build',
      run: () => {
        aws.exec(
          `aws amplify start-job --app-id ${aws.shellEscape(state.appId)}` +
          ` --branch-name ${aws.shellEscape(branch)}` +
          ` --job-type RELEASE` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
    {
      title: 'Save Studio configuration',
      run: () => {
        cfg.studio = {
          stackName: studioStackName,
          amplifyAppId: state.appId,
          amplifyUrl: state.studioUrl,
          authMode,
          branch,
        };
        config.write(cfg);
      },
    },
  ]);

  summary('BOA Studio deployed', [
    ['Studio URL', state.studioUrl],
    ['Stack', studioStackName],
    ['Auth mode', authMode],
    ['Branch', branch],
  ]);
  blank();
  if (opts.token) {
    console.log(`  ${sym.arrow} Build in progress. Studio will be live at the URL above in a few minutes.`);
  } else {
    console.log(`  ${sym.arrow} Auto-build is disabled (no GitHub token). Run 'boa studio update' to trigger the first build.`);
  }
  if (authMode === 'token') {
    blank();
    console.log(`  ${sym.info} Your access token is stored in SSM at /${stackName}/studio-config.`);
  }
}

async function update(_args) {
  const cfg = config.requireConfig();
  const { stackName, region } = cfg;

  if (!cfg.studio?.amplifyAppId) {
    console.error("Error: BOA Studio is not deployed. Run 'boa studio deploy' first.");
    process.exit(1);
  }

  const { amplifyAppId, branch = 'main', amplifyUrl } = cfg.studio;

  heading(`Updating BOA Studio for ${color.bold(stackName)}`);
  blank();

  await runTasks([
    {
      title: 'Refresh backend config in SSM',
      run: () => {
        aws.ssmPutParameter(
          `/${stackName}/studio-config`,
          JSON.stringify(cfg),
          region
        );
      },
    },
    {
      title: 'Trigger Studio rebuild',
      run: () => {
        aws.exec(
          `aws amplify start-job --app-id ${aws.shellEscape(amplifyAppId)}` +
          ` --branch-name ${aws.shellEscape(branch)}` +
          ` --job-type RELEASE` +
          ` --region ${aws.shellEscape(region)}`
        );
      },
    },
  ]);

  blank();
  console.log(`  ${sym.ok} Build triggered. Studio will be updated at:`);
  console.log(`     ${amplifyUrl}`);
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
    console.error("Error: BOA Studio is not deployed for this project. Nothing to remove.");
    process.exit(1);
  }

  const { stackName: studioStackName, authMode, amplifyUrl } = cfg.studio;

  console.log('');
  console.log('This will permanently delete:');
  console.log(`  • Amplify app and all builds`);
  console.log(`  • IAM service role`);
  if (authMode === 'cognito') {
    console.log(`  • Cognito user pool (studio admin accounts)`);
  }
  console.log(`  • CloudFormation stack: ${studioStackName}`);
  console.log('');
  console.log('Your BOA backend (database, auth, API) is NOT affected.');
  console.log('');

  const answer = await prompt(`Type the stack name to confirm [${studioStackName}]: `);

  if (answer !== studioStackName) {
    console.log(`Remove cancelled. You typed '${answer}' but expected '${studioStackName}'.`);
    process.exit(0);
  }

  console.log('');
  console.log(`Deleting CloudFormation stack '${studioStackName}'...`);

  aws.exec(
    `aws cloudformation delete-stack` +
    ` --stack-name ${aws.shellEscape(studioStackName)}` +
    ` --region ${aws.shellEscape(region)}`
  );

  // Poll until stack is gone or deletion fails
  let deleted = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    try {
      const out = aws.exec(
        `aws cloudformation describe-stacks` +
        ` --stack-name ${aws.shellEscape(studioStackName)}` +
        ` --region ${aws.shellEscape(region)}` +
        ` --query 'Stacks[0].StackStatus' --output text`
      );
      const status = out.trim();
      if (status === 'DELETE_FAILED') {
        fail(`Stack deletion failed (status: DELETE_FAILED).`);
        console.error(`  Check the CloudFormation console for details.`);
        process.exit(1);
      }
      process.stdout.write('.');
    } catch {
      // describe-stacks throws when the stack no longer exists
      deleted = true;
      break;
    }
  }

  if (!deleted) {
    fail('Stack deletion timed out. Check the CloudFormation console.');
    process.exit(1);
  }

  ok(`Stack '${studioStackName}' deleted`);

  // Remove studio key from config
  delete cfg.studio;
  config.write(cfg);
  ok('Studio configuration removed from .boa/config.json');

  console.log('');
  console.log(`BOA Studio removed. Your backend at ${cfg.apiUrl} is unaffected.`);
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
  --repo <url>           GitHub repo URL (required)
  --token <pat>          GitHub personal access token (optional for public repos)
  --branch <branch>      Branch to deploy (default: main)
  --auth-mode <mode>     Auth mode: token or cognito (default: token)
  --session-secret <s>   Session cookie secret (auto-generated if omitted)
  --access-token <t>     Access token for token mode (auto-generated if omitted)`);
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

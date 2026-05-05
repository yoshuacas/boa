import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import { runTasks, heading, summary, blank, color, sym } from '../lib/ui.mjs';

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
    console.error('  Example: boa studio deploy --repo https://github.com/org/repo --token ghp_...');
    process.exit(1);
  }
  if (!opts.token) {
    console.error('Error: --token <github-pat> is required');
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
          `GitHubToken=${opts.token}`,
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
  console.log(`  ${sym.arrow} Build in progress. Studio will be live at the URL above in a few minutes.`);
  if (authMode === 'token') {
    blank();
    console.log(`  ${sym.info} Your access token is stored in SSM at /${stackName}/studio-config.`);
  }
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
  --token <pat>          GitHub personal access token (required)
  --branch <branch>      Branch to deploy (default: main)
  --auth-mode <mode>     Auth mode: token or cognito (default: token)
  --session-secret <s>   Session cookie secret (auto-generated if omitted)
  --access-token <t>     Access token for token mode (auto-generated if omitted)`);
    process.exit(0);
  }

  switch (sub) {
    case 'deploy': return deploy(rest);
    case 'update':
    case 'remove':
      console.error(`Error: 'boa studio ${sub}' is not yet implemented.`);
      process.exit(1);
    default:
      console.error(`Unknown subcommand: ${sub}`);
      console.error("Run 'boa studio --help' for usage.");
      process.exit(1);
  }
}

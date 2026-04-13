import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';

const BOA_REPO = 'aws/boa';

async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getContext() {
  const ctx = { cliVersion: 'unknown', region: 'unknown', stackName: 'none' };

  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    ctx.cliVersion = pkg.version;
  } catch { /* ignore */ }

  const cfg = config.read();
  if (cfg) {
    ctx.region = cfg.region || 'unknown';
    ctx.stackName = cfg.stackName || 'none';
  }

  return ctx;
}

function ghAvailable() {
  try {
    aws.exec('gh auth status');
    return true;
  } catch {
    return false;
  }
}

export default async function feedback(args) {
  // Check for .boa/feedback.md (written by agent when gh wasn't available)
  const feedbackFile = join(process.cwd(), '.boa', 'feedback.md');
  const hasFile = existsSync(feedbackFile);

  if (args.includes('--submit') && hasFile) {
    // Submit existing feedback file
    if (!ghAvailable()) {
      console.error(
        "Error: GitHub CLI not authenticated. Run 'gh auth login' first."
      );
      process.exit(1);
    }

    const body = readFileSync(feedbackFile, 'utf8');
    console.log('Submitting feedback from .boa/feedback.md...');
    console.log('');
    console.log(body);
    console.log('');

    const confirm = await prompt('Submit this as a GitHub issue? [y/N]: ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }

    const title = await prompt('Issue title: ');
    if (!title) {
      console.log('Cancelled — title is required.');
      return;
    }

    aws.run(
      `gh issue create --repo ${BOA_REPO} --title ${aws.shellEscape(title)} --label agent-feedback --body ${aws.shellEscape(body)}`
    );
    console.log('');
    console.log('Feedback submitted. Thank you!');
    return;
  }

  // Interactive mode
  console.log('BOA Feedback');
  console.log('');
  console.log(
    'Help improve BOA by reporting bugs, missing features, or confusing behavior.'
  );
  console.log(
    'Your feedback is filed as a GitHub issue so the team can track and fix it.'
  );
  console.log('');

  if (!ghAvailable()) {
    console.error(
      "GitHub CLI not authenticated. Run 'gh auth login' first,"
    );
    console.error(
      'or write your feedback to .boa/feedback.md and run: boa feedback --submit'
    );
    process.exit(1);
  }

  const title = await prompt('What went wrong? (short title): ');
  if (!title) {
    console.log('Cancelled.');
    return;
  }

  const description = await prompt(
    'Describe what happened and what you expected: '
  );
  const workaround = await prompt(
    'Did you find a workaround? If so, what was it: '
  );

  const ctx = getContext();

  const body = `## What happened
${description || 'No description provided.'}

## Workaround
${workaround || 'None.'}

## Environment
- CLI version: ${ctx.cliVersion}
- Skill version: 0.5
- Region: ${ctx.region}
- Stack: ${ctx.stackName}

---
*Submitted via \`boa feedback\`*`;

  console.log('');
  console.log('--- Preview ---');
  console.log(`Title: ${title}`);
  console.log(body);
  console.log('--- End preview ---');
  console.log('');

  const confirm = await prompt('Submit? [y/N]: ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return;
  }

  aws.run(
    `gh issue create --repo ${BOA_REPO} --title ${aws.shellEscape(title)} --label agent-feedback --body ${aws.shellEscape(body)}`
  );
  console.log('');
  console.log('Feedback submitted. Thank you!');
}

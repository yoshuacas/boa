#!/usr/bin/env node
// Simulate a `boa deploy` run without touching AWS. Uses the real
// ui.mjs so the output matches what a live deploy looks like.
// Handy for screenshots, docs, and demos.

import {
  runTasks, heading, warn, summary, blank, color, sym,
} from '../lib/ui.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Randomised duration so concept subtasks don't all finish in
// lockstep — mirrors how CloudFormation actually reports events.
const vary = (base, jitter = 0.4) => {
  const f = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.max(200, Math.round(base * f));
};

// Map CLI arg to scenario. --scenario=failure makes one concept
// fail so you can see how the UI renders errors.
const failureMode = process.argv.includes('--scenario=failure');

heading(`Deploying ${color.bold('nboa')} to us-east-2`);
blank();

try {
  await runTasks([
    {
      title: 'Check Lambda dependencies',
      run: async () => { await sleep(vary(400)); },
    },
    {
      title: 'Preparing REST API, authentication, and authorization runtime',
      run: async (_ctx, t) => {
        t.update('bundling the serverless runtime…');
        await sleep(vary(1200));
        t.update('uploading to S3…');
        await sleep(vary(1500));
      },
    },
    {
      title: 'Provisioning cloud resources',
      run: async () => {
        const concepts = [
          { name: 'Database', duration: 12000 },
          { name: 'File storage', duration: 4000 },
          { name: 'API', duration: 8000 },
          { name: 'Firewall', duration: 3000, fail: failureMode },
        ];
        return concepts.map((c) => ({
          title: c.name,
          run: async () => {
            await sleep(vary(c.duration));
            if (c.fail) {
              throw new Error('WAF Web ACL limit reached (code: WAFLimitsExceededException)');
            }
          },
        }));
      },
    },
    {
      title: 'Fetch deployment details',
      run: async () => { await sleep(vary(600)); },
    },
    {
      title: 'Ensure auth schema',
      run: async () => { await sleep(vary(900)); },
    },
    {
      title: 'Write configuration',
      run: async () => { await sleep(vary(300)); },
    },
    {
      title: 'Apply database migrations',
      run: async () => [
        {
          title: 'Load migration history',
          run: async () => { await sleep(vary(400)); },
        },
        {
          title: 'Apply 1 migration(s)',
          run: () => [
            {
              title: '001_create_quests.sql',
              run: async () => { await sleep(vary(700)); },
            },
          ],
        },
        {
          title: 'Refresh PostgREST schema cache',
          run: async () => { await sleep(vary(500)); },
        },
      ],
    },
  ]);

  summary('Deployment complete', [
    ['API URL', 'https://ugqevio5v3.execute-api.us-east-2.amazonaws.com/prod'],
    ['Stack', 'nboa'],
    ['Region', 'us-east-2'],
    ['Auth', 'better-auth'],
    ['Storage', 'nboa-storage-684618342405'],
    ['Database', 'dbtxptddbchzqiimsjyokltjam.dsql.us-east-2.on.aws'],
  ]);
  blank();
  console.log(`  ${sym.arrow} Next: add tables in ${color.cyan('migrations/')} and policies in ${color.cyan('policies/')}, then run ${color.bold('boa deploy')}.`);
} catch (err) {
  blank();
  console.error(`  ${sym.fail} ${color.red(err.message)}`);
  process.exit(1);
}

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { loadConfig } from '../helpers/config.mjs';
import { sleep } from '../helpers/wait.mjs';
import { signStripePayload, buildCheckoutEvent } from '../helpers/stripe.mjs';

const PROJECT_DIR = process.env.BOA_PROJECT_DIR || process.cwd();
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

let config;
let supabase;       // authenticated user client
let admin;          // service role client (bypasses Cedar)
let lambda;
let testUser;

describe('Custom Functions E2E', () => {
  before(async () => {
    config = loadConfig(PROJECT_DIR);
    admin = createClient(config.apiUrl, config.serviceRoleKey);

    // Create a test user and sign in
    const email = `functest-${Date.now()}@example.com`;
    const password = 'TestPass123!';

    const anonClient = createClient(config.apiUrl, config.anonKey);
    const { data: signupData, error: signupErr } = await anonClient.auth.signUp({ email, password });
    assert(!signupErr, `Signup failed: ${signupErr?.message}`);

    const { data: signinData, error: signinErr } = await anonClient.auth.signInWithPassword({ email, password });
    assert(!signinErr, `Signin failed: ${signinErr?.message}`);
    assert(signinData.session?.access_token, 'No access token after signin');

    testUser = signinData.user;
    supabase = createClient(config.apiUrl, config.anonKey, {
      global: { headers: { Authorization: `Bearer ${signinData.session.access_token}` } }
    });

    lambda = new LambdaClient({ region: config.region });
  });

  after(async () => {
    // Clean up test user
    if (testUser?.id) {
      await admin.auth.admin.deleteUser(testUser.id);
    }
  });

  // ─── API FUNCTION ────────────────────────────────────────

  describe('API Function (league-standings)', () => {
    it('returns standings for authenticated user', async () => {
      const { data, error } = await supabase.functions.invoke('league-standings');

      assert(!error, `Function invoke failed: ${error?.message}`);
      assert(Array.isArray(data), 'Response should be an array');

      // If there's seed data, verify structure
      if (data.length > 0) {
        const team = data[0];
        assert('team_name' in team || 'name' in team, 'Missing team name field');
        assert('points' in team, 'Missing points field');
        assert('wins' in team, 'Missing wins field');
        assert('draws' in team, 'Missing draws field');
        assert('losses' in team, 'Missing losses field');

        // Verify point calculation: 3*wins + 1*draws
        const expectedPoints = (team.wins * 3) + (team.draws * 1);
        assert.equal(team.points, expectedPoints,
          `Points mismatch: expected ${expectedPoints} (${team.wins}W ${team.draws}D), got ${team.points}`);

        // Verify played = wins + draws + losses
        const played = team.played || (team.wins + team.draws + team.losses);
        assert.equal(team.wins + team.draws + team.losses, played,
          'wins + draws + losses should equal played');
      }
    });

    it('rejects unauthenticated requests', async () => {
      const unauthClient = createClient(config.apiUrl, config.anonKey);
      const response = await fetch(`${config.apiUrl}/functions/v1/league-standings`, {
        method: 'POST',
        headers: { 'apikey': config.anonKey },
      });

      assert(response.status === 401 || response.status === 403,
        `Expected 401/403 for unauthed request, got ${response.status}`);
    });
  });

  // ─── WEBHOOK FUNCTION ────────────────────────────────────

  describe('Webhook Function (stripe-webhook)', () => {
    const webhookUrl = () => `${config.apiUrl}/functions/v1/stripe-webhook`;

    it('accepts request with valid Stripe signature', async () => {
      const payload = buildCheckoutEvent({
        sessionId: `cs_test_valid_${Date.now()}`,
        playerId: testUser.id,
        amount: 4999,
      });
      const { signature } = signStripePayload(payload, WEBHOOK_SECRET);

      const response = await fetch(webhookUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': signature,
          'apikey': config.anonKey,
        },
        body: payload,
      });

      assert(response.ok, `Webhook returned ${response.status}: ${await response.text()}`);
      const body = await response.json();
      assert(body.received === true || response.status === 200, 'Expected {received: true}');
    });

    it('rejects request with bad Stripe signature', async () => {
      const payload = buildCheckoutEvent({ sessionId: `cs_test_bad_${Date.now()}` });

      const response = await fetch(webhookUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=1234567890,v1=bad_signature_value',
          'apikey': config.anonKey,
        },
        body: payload,
      });

      assert.equal(response.status, 400,
        `Expected 400 for bad signature, got ${response.status}`);
    });

    it('rejects request with missing signature header', async () => {
      const payload = buildCheckoutEvent({ sessionId: `cs_test_nosig_${Date.now()}` });

      const response = await fetch(webhookUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.anonKey,
        },
        body: payload,
      });

      assert(response.status === 400 || response.status === 500,
        `Expected 400/500 for missing signature, got ${response.status}`);
    });

    it('valid webhook creates a database side effect', async () => {
      // Get payment count before
      const { count: beforeCount } = await admin
        .from('payments')
        .select('*', { count: 'exact', head: true });

      // Send valid webhook
      const sessionId = `cs_test_sideeffect_${Date.now()}`;
      const payload = buildCheckoutEvent({
        sessionId,
        playerId: testUser.id,
        amount: 2999,
      });
      const { signature } = signStripePayload(payload, WEBHOOK_SECRET);

      await fetch(webhookUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': signature,
          'apikey': config.anonKey,
        },
        body: payload,
      });

      // Wait for DB write
      await sleep(1000);

      // Verify row was created
      const { count: afterCount } = await admin
        .from('payments')
        .select('*', { count: 'exact', head: true });

      assert(afterCount > beforeCount,
        `Expected payment row to be created: before=${beforeCount}, after=${afterCount}`);
    });

    it('bad signature does NOT create a database side effect', async () => {
      const { count: beforeCount } = await admin
        .from('payments')
        .select('*', { count: 'exact', head: true });

      const payload = buildCheckoutEvent({ sessionId: `cs_test_nosideeffect_${Date.now()}` });
      await fetch(webhookUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=1234567890,v1=definitely_wrong',
          'apikey': config.anonKey,
        },
        body: payload,
      });

      await sleep(1000);

      const { count: afterCount } = await admin
        .from('payments')
        .select('*', { count: 'exact', head: true });

      assert.equal(afterCount, beforeCount,
        `Payment row should NOT be created on bad signature: before=${beforeCount}, after=${afterCount}`);
    });
  });

  // ─── SCHEDULED FUNCTION ──────────────────────────────────

  describe('Scheduled Function (daily-stats-summary)', () => {
    it('produces a daily_reports row when manually invoked', async () => {
      const { count: beforeCount } = await admin
        .from('daily_reports')
        .select('*', { count: 'exact', head: true });

      // Manually invoke the scheduled Lambda
      const functionName = `${config.stackName}-daily-stats-summary`;
      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({}),
      });

      const result = await lambda.send(command);
      const responsePayload = JSON.parse(Buffer.from(result.Payload).toString());

      assert(!result.FunctionError,
        `Lambda invocation failed: ${responsePayload?.errorMessage || result.FunctionError}`);

      // Wait for DB write
      await sleep(2000);

      const { count: afterCount } = await admin
        .from('daily_reports')
        .select('*', { count: 'exact', head: true });

      assert(afterCount > beforeCount,
        `Expected daily_reports row: before=${beforeCount}, after=${afterCount}`);
    });

    it('produces correct aggregation values', async () => {
      // Get the most recent report
      const { data: reports } = await admin
        .from('daily_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      assert(reports.length > 0, 'No daily_reports rows found');
      const report = reports[0];

      // Verify structure
      assert('total_goals' in report, 'Missing total_goals');
      assert('total_games' in report, 'Missing total_games');
      assert(report.total_goals >= 0, `total_goals should be >= 0, got ${report.total_goals}`);
      assert(report.total_games >= 0, `total_games should be >= 0, got ${report.total_games}`);

      // If there's game data, verify avg makes sense
      if (report.total_games > 0) {
        const expectedAvg = report.total_goals / report.total_games;
        const actualAvg = parseFloat(report.avg_goals_per_game);
        assert(Math.abs(actualAvg - expectedAvg) < 0.1,
          `avg_goals_per_game mismatch: expected ~${expectedAvg.toFixed(2)}, got ${actualAvg}`);
      }
    });
  });
});

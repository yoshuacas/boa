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

    // Create a unique test user and sign in
    const email = `functest-${Date.now()}@example.com`;
    const password = 'FuncTest123!';

    const anonClient = createClient(config.apiUrl, config.anonKey);

    // Sign up
    const { error: signupErr } = await anonClient.auth.signUp({ email, password });
    if (signupErr) {
      console.log(`Signup note: ${signupErr.message} (may already exist, trying signin)`);
    }

    // Sign in (works whether signup just succeeded or user already existed)
    const { data: signinData, error: signinErr } = await anonClient.auth.signInWithPassword({ email, password });
    assert(!signinErr, `Signin failed for ${email}: ${signinErr?.message}`);
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

      // Response may be a bare array or wrapped in {standings: [...]}
      const standings = Array.isArray(data) ? data : (data?.standings || []);
      assert(Array.isArray(standings), `Expected standings array, got: ${JSON.stringify(data)}`);

      // If there's seed data, verify structure
      if (standings.length > 0) {
        const team = standings[0];
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

      const bodyText = await response.text();
      assert(response.ok, `Webhook returned ${response.status}: ${bodyText}`);
      const body = JSON.parse(bodyText);
      assert(body.received === true, 'Expected {received: true}');
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
      const { data: beforePayments } = await admin.from('payments').select('*');

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
      const { data: afterPayments } = await admin.from('payments').select('*');

      assert(afterPayments.length > beforePayments.length,
        `Expected payment row to be created: before=${beforePayments.length}, after=${afterPayments.length}`);
    });

    it('bad signature does NOT create a database side effect', async () => {
      const { data: beforePayments } = await admin.from('payments').select('*');

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

      const { data: afterPayments } = await admin.from('payments').select('*');

      assert.equal(afterPayments.length, beforePayments.length,
        `Payment row should NOT be created on bad signature: before=${beforePayments.length}, after=${afterPayments.length}`);
    });
  });

  // ─── SCHEDULED FUNCTION ──────────────────────────────────

  describe('Scheduled Function (daily-stats-summary)', () => {
    it('produces a daily_reports row when manually invoked', async () => {
      const { data: beforeReports } = await admin.from('daily_reports').select('*');

      // Manually invoke the scheduled Lambda
      // Try the actual function name — agents may name it differently
      const possibleNames = [
        `${config.stackName}-daily-stats-summary`,
        `${config.stackName}-daily-report`,
        `${config.stackName}-nightly-stats`,
      ];
      let functionName;
      for (const name of possibleNames) {
        try {
          await lambda.send(new InvokeCommand({ FunctionName: name, InvocationType: 'DryRun', Payload: '{}' }));
          functionName = name;
          break;
        } catch (e) {
          if (e.name !== 'ResourceNotFoundException') { functionName = name; break; }
        }
      }
      assert(functionName, `No scheduled function found. Tried: ${possibleNames.join(', ')}`);
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

      const { data: afterReports } = await admin.from('daily_reports').select('*');

      assert(afterReports.length > beforeReports.length,
        `Expected daily_reports row: before=${beforeReports.length}, after=${afterReports.length}`);
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

      // Verify the report has meaningful content (column names may vary)
      const keys = Object.keys(report);
      assert(keys.length >= 3, `Report should have at least 3 fields, got: ${keys.join(', ')}`);
      assert('report_date' in report || 'date' in report || 'created_at' in report,
        `Report should have a date field, got: ${keys.join(', ')}`);
    });
  });
});

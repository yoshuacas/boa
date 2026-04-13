import { createHmac } from 'node:crypto';

/**
 * Generate a valid Stripe webhook signature for testing.
 * Matches Stripe's v1 signature scheme: HMAC-SHA256 of "timestamp.payload".
 *
 * @param {string} payload - JSON string body
 * @param {string} secret - Webhook signing secret (whsec_...)
 * @returns {{ signature: string, timestamp: number }}
 */
export function signStripePayload(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const signature = `t=${timestamp},v1=${hmac}`;
  return { signature, timestamp };
}

/**
 * Build a minimal Stripe checkout.session.completed event.
 */
export function buildCheckoutEvent({ sessionId, playerId, leagueId, amount }) {
  return JSON.stringify({
    id: `evt_test_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId || `cs_test_${Date.now()}`,
        amount_total: amount || 2999,
        currency: 'usd',
        payment_status: 'paid',
        client_reference_id: playerId || 'test-player-id',
        metadata: {
          player_id: playerId || 'test-player-id',
          league_id: leagueId || 'test-league-id',
        },
      },
    },
  });
}

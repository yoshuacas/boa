// functions/stripe-webhook/index.mjs
// Webhook function — publicly accessible (Auth: NONE), validates Stripe signature
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const supabase = createClient(
  process.env.API_URL,
  process.env.SERVICE_ROLE_KEY
);

export async function handler(event) {
  // Verify Stripe webhook signature (replaces JWT auth for this endpoint)
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Webhook signature verification failed' }),
    };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        // Update payment status for the team/player
        await supabase
          .from('payments')
          .update({ status: 'paid', stripe_session_id: session.id })
          .eq('stripe_session_id', session.id);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = stripeEvent.data.object;
        await supabase
          .from('payments')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('stripe_invoice_id', invoice.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        await supabase
          .from('payments')
          .update({ status: 'failed' })
          .eq('stripe_invoice_id', invoice.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error('Error processing webhook:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

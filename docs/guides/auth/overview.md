# Authentication

Auth works the moment your backend is deployed. Customers can sign up and sign in immediately — no configuration, no email verification setup, no additional deployment steps.

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(config.apiUrl, config.anonKey)

// Sign up a new customer
await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'SecurePass123!'
})

// Sign in
const { data } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'SecurePass123!'
})

// Now every request is authenticated
const { data: todos } = await supabase.from('todos').select('*')
```

That's it. The Supabase client manages sessions, token refresh, and headers automatically.

## How it works

1. Your customer signs up or signs in through your frontend
2. The auth service validates credentials and issues a session token
3. `@supabase/supabase-js` stores the token and attaches it to every API request
4. The BOA authorizer validates the token at the API Gateway
5. Your Lambda function receives the customer's ID, email, and role

The pre-signup trigger auto-confirms customers, so they can sign in immediately after signing up. No email verification required. (You can add verification later if your app needs it.)

## What's configured by default

BOA sets up auth with these defaults during `boa init`:

| Setting | Default | Notes |
|---------|---------|-------|
| Sign-up | Enabled | Customers create their own accounts |
| Sign-in method | Email + password | Social login available with additional config |
| Email verification | Skipped | Pre-signup trigger auto-confirms customers |
| Password policy | 8+ chars, upper + lower + number | Symbols optional |
| Token lifetime | 1 hour (access), 30 days (refresh) | Auto-refresh handled by Supabase client |
| Free tier | 10,000 MAU | No cost until you pass 10K monthly active customers |

## Three roles

Every API request gets one of three roles based on the credentials provided:

| Role | When | What it can do |
|------|------|---------------|
| `anon` | Request has only the API key, no user token | Whatever your access policies allow for anonymous customers |
| `authenticated` | Request has a valid user token | Access their own data (controlled by policies) |
| `service_role` | Request uses the service role key | Everything — bypasses all policies (server-side only) |

The `anonKey` and `serviceRoleKey` are in `.boa/config.json`. Never expose the service role key in frontend code.

## Reading customer info in Lambda

If you write custom Lambda functions, the BOA authorizer passes the customer's info as flat keys:

```javascript
export async function handler(event) {
  const userId = event.requestContext.authorizer.userId   // UUID or ''
  const email = event.requestContext.authorizer.email     // email or ''
  const role = event.requestContext.authorizer.role       // 'anon' | 'authenticated' | 'service_role'
}
```

Do **not** use `event.requestContext.authorizer.claims.sub` — that's the Cognito authorizer format. BOA uses a custom authorizer with flat keys.

## Auth without the Supabase client

You can call the auth API directly with any HTTP client. The endpoints are GoTrue-compatible:

```
POST /auth/v1/signup                         — create an account
POST /auth/v1/token?grant_type=password      — sign in
POST /auth/v1/token?grant_type=refresh_token — refresh session
GET  /auth/v1/user                           — get current user
POST /auth/v1/logout                         — sign out
```

Every request needs an `apikey` header. Authenticated requests also need `Authorization: Bearer <access_token>`.

## Common questions

**Do customers need to verify their email?**
Not by default. The pre-signup trigger auto-confirms customers so they can sign in immediately. To require email verification, remove the pre-signup trigger and configure SES for sending verification emails.

**What about password reset?**
Password reset requires SES (Simple Email Service) to send the reset email. This isn't configured by default. See [Email and Password Auth](/docs/auth/email-password) for details.

**How long do sessions last?**
Access tokens expire after 1 hour. Refresh tokens last 30 days. The Supabase client handles refresh automatically — your customers stay signed in until they explicitly sign out or are inactive for 30 days.

## Next step

Your auth is already working. **[Set up access policies](/docs/api/authorization)** so your tables enforce who can read and write what.

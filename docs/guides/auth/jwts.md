# Sessions and Tokens

When a customer signs in, they get a session. `@supabase/supabase-js` manages sessions automatically — you don't need to think about tokens unless you're debugging or building a custom client.

## How sessions work

```javascript
// Sign in — this creates a session
const { data } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'SecurePass123!'
})

// Every request after this is authenticated automatically
const { data: todos } = await supabase.from('todos').select('*')

// Check the current session at any time
const { data: { session } } = await supabase.auth.getSession()
```

The Supabase client stores the session in memory, attaches the access token to every request, and refreshes the token before it expires. You don't manage any of this.

## What's inside a session

A session contains three tokens:

| Token | What it does | Expires |
|-------|-------------|---------|
| **Access token** | Sent with every API request to prove who the customer is | 1 hour |
| **ID token** | Contains customer claims (email, sub, custom attributes) | 1 hour |
| **Refresh token** | Exchanged for new access and ID tokens when they expire | 30 days |

The Supabase client uses the access token for API requests and the refresh token to get new tokens silently. You rarely interact with the ID token directly.

## Token refresh

The Supabase client handles refresh automatically. When the access token is close to expiring, the client sends the refresh token to get a new pair. This happens in the background — your code does not need to handle it.

**When the refresh token expires (after 30 days of inactivity):** the customer must sign in again. There is no way to extend a refresh token. If your app has customers who return after long gaps, handle the session expiry gracefully:

```javascript
const { data: { session } } = await supabase.auth.getSession()

if (!session) {
  // No valid session — redirect to sign-in
  window.location.href = '/login'
}
```

You can also listen for auth state changes:

```javascript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    // Update your UI accordingly
  }
})
```

## Sending tokens with a custom client

If you are not using `@supabase/supabase-js`, you need to manage tokens yourself.

**Authenticated request with fetch:**

```javascript
const response = await fetch(`${API_URL}/rest/v1/todos`, {
  headers: {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
});
```

**Refresh the session manually:**

```bash
curl -X POST "$API_URL/auth/v1/token?grant_type=refresh_token" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"<refresh_token>"}'
```

## Debugging tokens

Paste an access token into [jwt.io](https://jwt.io) to inspect its contents. You will see:

```json
{
  "sub": "a1b2c3d4-...",
  "email": "user@example.com",
  "token_use": "access",
  "auth_time": 1714000000,
  "exp": 1714003600,
  "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123"
}
```

- `sub` is the customer's unique ID (same as `data.user.id` from sign-in)
- `exp` is the expiry time as a Unix timestamp — check if the token is expired
- `iss` is the user pool that issued it — useful for verifying you are hitting the right backend

If a request fails with `401 Unauthorized`, decode the token first. Most auth issues are expired tokens, tokens from the wrong user pool, or the ID token being sent instead of the access token.

## What the authorizer passes to your code

The BOA custom authorizer validates the JWT and passes these flat keys to Lambda:

```javascript
event.requestContext.authorizer.role     // 'anon' | 'authenticated' | 'service_role'
event.requestContext.authorizer.userId   // user UUID or '' for anon
event.requestContext.authorizer.email    // user email or ''
```

Do **not** use `event.requestContext.authorizer.claims.sub` — that is the default Cognito authorizer format. BOA uses a custom authorizer with flat keys.

## Anonymous access

Requests without a user token (only the `apikey` header) are treated as anonymous:

```javascript
event.requestContext.authorizer.role     // 'anon'
event.requestContext.authorizer.userId   // ''
event.requestContext.authorizer.email    // ''
```

Use anonymous access when your app has public content that anyone can read — a product catalog, public blog posts, a landing page that loads data from your API. The customer does not need to sign in, but you still control what they can see through access policies.

For example, you might allow anonymous customers to read published posts but require authentication to create or edit them. The access policy controls this, not your application code.

Anonymous requests still need the `apikey` header. Requests with no headers at all are rejected.

## Service role

The service role key bypasses all access policies. Use it only in server-side code — Lambda functions, backend jobs, admin scripts. Never expose it to the frontend.

```javascript
import { createClient } from '@supabase/supabase-js'

// Admin client — bypasses all access policies
const supabase = createClient(API_URL, SERVICE_ROLE_KEY)
```

If the service role key is compromised, rotate it immediately by updating the API key in API Gateway and redeploying.

## Next step

Set up [access policies](/docs/api/authorization) to control which rows each role can read and write.

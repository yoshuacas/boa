# Email and Password Auth

The default. Customers sign up with an email and password, and can sign in immediately — no verification email required.

## Sign up

```javascript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'SecurePass123!'
})

if (error) {
  console.error('Sign-up failed:', error.message)
} else {
  console.log('Customer created:', data.user.id)
  // Customer is confirmed and signed in — no email verification step
}
```

The password must be at least 8 characters with one uppercase letter, one lowercase letter, and one number. Symbols are optional. If the password is too weak, you get:

```json
{ "error": "Password did not conform with policy: Password not long enough" }
```

If the email is already registered:

```json
{ "error": "User already exists" }
```

## Sign in

```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'SecurePass123!'
})

if (data.session) {
  // Customer is signed in — all subsequent requests are authenticated automatically
}
```

If the password is wrong:

```json
{ "error": "Invalid login credentials" }
```

## Sign out

```javascript
const { error } = await supabase.auth.signOut()
```

This clears the local session. The refresh token is invalidated server-side.

## REST API (for debugging and testing)

When you need to test auth without a frontend, use the REST endpoints directly.

**Sign up:**

```bash
curl -X POST "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'
```

**Sign in:**

```bash
curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}' \
  | jq -r '.access_token'
```

**Get current user:**

```bash
curl -s "$API_URL/auth/v1/user" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN"
```

## Why customers can sign in immediately

BOA deploys a pre-signup Lambda trigger that auto-confirms every new customer:

```javascript
export const handler = async (event) => {
  event.response.autoConfirmUser = true;
  if (event.request.userAttributes.email) {
    event.response.autoVerifyEmail = true;
  }
  return event;
};
```

This skips the email verification step entirely. If your app needs email verification (finance, healthcare, anything where you must prove the customer owns the email), remove this trigger and configure SES to send verification emails.

## Password reset

Password reset sends an email with a reset link. This requires Amazon SES to be configured — it is not set up by default.

**Request a reset email:**

```javascript
const { error } = await supabase.auth.resetPasswordForEmail('user@example.com')
```

**Complete the reset (after the customer clicks the email link):**

```javascript
const { error } = await supabase.auth.updateUser({
  password: 'NewSecurePass456!'
})
```

If you call `resetPasswordForEmail` without SES configured, the call succeeds silently but no email is sent. This is a Cognito behavior, not a bug — configure SES first, then test password reset.

To set up SES: verify your sending domain or email address in the AWS console under Amazon SES, then update your Cognito user pool's email configuration to use SES instead of the default Cognito email. The default Cognito email is limited to 50 emails per day and cannot be used for password reset in production.

## Vite frontend troubleshooting

If you see this error in the browser console:

```
Uncaught ReferenceError: global is not defined
```

Add this to your Vite config:

```javascript
// vite.config.js
export default {
  define: {
    global: 'globalThis'
  }
}
```

The `@supabase/supabase-js` client depends on libraries that reference `global`, which exists in Node.js but not in browsers. This one-line polyfill fixes it.

## Next step

Add social login with [Google, Apple, or another provider](social-login.md), or learn how [sessions and tokens](jwts.md) work under the hood.

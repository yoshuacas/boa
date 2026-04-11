# Rubric: Authentication Works

## What we're verifying
Users can self-register and sign in via Cognito.

## How to verify

```bash
# Check self-signup is enabled
ALLOW_SELF=$(aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly' \
  --output text)

# Attempt signup
aws cognito-idp sign-up \
  --client-id "$CLIENT_ID" \
  --username "eval-test@example.com" \
  --password 'EvalTest123!'

# Check user status (should be CONFIRMED, not UNCONFIRMED)
STATUS=$(aws cognito-idp admin-get-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "eval-test@example.com" \
  --query 'UserStatus' \
  --output text)
```

## Pass condition
- `AllowAdminCreateUserOnly` is `False`
- Sign-up succeeds without error
- User status is `CONFIRMED` (pre-signup trigger auto-confirms)

## Fail condition
- Sign-up returns "User is not authorized"
- User stuck in `UNCONFIRMED` status
- Pre-signup trigger not attached or not auto-confirming

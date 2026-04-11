# Rubric: API Works

## What we're verifying
The REST API responds correctly to authenticated and unauthenticated requests.

## How to verify

```bash
# Unauthenticated request should return 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/items")

# Authenticated request should return 200
# (requires getting a token first via Cognito auth)
TOKEN=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters Username="eval-test@example.com",Password='EvalTest123!' \
  --query 'AuthenticationResult.IdToken' \
  --output text)

AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: $TOKEN" "$API_URL/items")
```

## Pass condition
- Unauthenticated request returns `401`
- Authenticated request returns `200` (with empty array or items)

## Fail condition
- Unauthenticated request returns `500` (Lambda error, not auth rejection)
- Unauthenticated request returns `403` (wrong authorizer config)
- Authenticated request returns `500` (Lambda code error)
- CORS errors in browser (missing headers)

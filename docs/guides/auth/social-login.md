# Social Login

Add Google, Apple, or any OAuth provider as a sign-in option. This is the most complex auth feature — expect 15-20 minutes for the first provider.

The complexity comes from three systems that need to agree: the OAuth provider (Google, Apple), your auth configuration, and your frontend. Once the first provider works, adding a second one takes five minutes.

## How it works

1. Your frontend redirects the customer to the hosted sign-in page
2. The auth service redirects to the OAuth provider (Google, Apple, etc.)
3. The customer authenticates with the provider
4. The provider redirects back to the auth service with an authorization code
5. The auth service exchanges the code for customer info and creates an account
6. The auth service redirects back to your app with a session

Social login customers get an account just like email/password customers. They appear in the same user pool, get the same JWTs, and work with the same access policies. The only difference is how they authenticate.

## Adding Google login

### 1. Create Google OAuth credentials

Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and create an OAuth 2.0 client ID:

- Application type: **Web application**
- Authorized redirect URIs: add `https://<your-cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`

Save the **client ID** and **client secret**. You will need both.

### 2. Add the identity provider to your SAM template

```yaml
CognitoUserPoolIdentityProviderGoogle:
  Type: AWS::Cognito::UserPoolIdentityProvider
  Properties:
    UserPoolId: !Ref CognitoUserPool
    ProviderName: Google
    ProviderType: Google
    ProviderDetails:
      client_id: !Ref GoogleClientId
      client_secret: !Ref GoogleClientSecret
      authorize_scopes: "openid email profile"
    AttributeMapping:
      email: email
      username: sub
```

### 3. Add a hosted UI domain

Cognito needs a domain for the OAuth redirect flow:

```yaml
CognitoUserPoolDomain:
  Type: AWS::Cognito::UserPoolDomain
  Properties:
    UserPoolId: !Ref CognitoUserPool
    Domain: !Sub "${ProjectName}-auth"
```

This creates a domain like `myapp-auth.auth.us-east-1.amazoncognito.com`. You can also use a custom domain if you have one.

### 4. Update the app client

```yaml
CognitoUserPoolClient:
  Properties:
    SupportedIdentityProviders:
      - COGNITO
      - Google
    AllowedOAuthFlows:
      - code
    AllowedOAuthScopes:
      - email
      - openid
      - profile
    AllowedOAuthFlowsUserPoolClient: true
    CallbackURLs:
      - http://localhost:3000/callback
      - https://your-app.com/callback
    LogoutURLs:
      - http://localhost:3000
      - https://your-app.com
```

Include `http://localhost:3000/callback` in `CallbackURLs` so you can test locally. Remove it before going to production, or leave it — it only works from localhost.

### 5. Deploy

```bash
boa deploy
```

### 6. Redirect the customer to sign in

```javascript
function signInWithGoogle() {
  const domain = 'your-project-auth.auth.us-east-1.amazoncognito.com';
  const clientId = config.auth.userPoolWebClientId;
  const redirectUri = encodeURIComponent(window.location.origin + '/callback');

  window.location.href =
    `https://${domain}/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&identity_provider=Google&scope=email+openid+profile`;
}
```

### 7. Handle the callback

When the customer comes back from Google, Cognito redirects to your callback URL with an authorization code. Exchange it for tokens:

```javascript
// /callback page
async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (!code) {
    console.error('No authorization code in callback URL');
    return;
  }

  const domain = 'your-project-auth.auth.us-east-1.amazoncognito.com';
  const clientId = config.auth.userPoolWebClientId;
  const redirectUri = window.location.origin + '/callback';

  const response = await fetch(`https://${domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code: code,
    }),
  });

  const tokens = await response.json();

  if (tokens.error) {
    console.error('Token exchange failed:', tokens.error);
    return;
  }

  // Initialize the Supabase client with the session
  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  // Redirect to the app
  window.location.href = '/';
}

handleCallback();
```

If the token exchange fails with `invalid_grant`, the authorization code has already been used or has expired (codes are single-use and valid for 5 minutes). Redirect the customer to sign in again.

## Adding Apple login

Similar to Google, with Apple-specific configuration:

```yaml
CognitoUserPoolIdentityProviderApple:
  Type: AWS::Cognito::UserPoolIdentityProvider
  Properties:
    UserPoolId: !Ref CognitoUserPool
    ProviderName: SignInWithApple
    ProviderType: SignInWithApple
    ProviderDetails:
      client_id: !Ref AppleClientId
      team_id: !Ref AppleTeamId
      key_id: !Ref AppleKeyId
      private_key: !Ref ApplePrivateKey
      authorize_scopes: "email name"
    AttributeMapping:
      email: email
      username: sub
```

Apple requires a paid Apple Developer account ($99/year). You will also need to register a Services ID and configure the Sign In with Apple capability in the Apple Developer portal. Apple only sends the customer's name on the first sign-in — store it immediately.

## Supported providers

The auth API supports these identity providers:

| Provider | ProviderType | Notes |
|----------|-------------|-------|
| Google | `Google` | Most common, easiest to set up |
| Apple | `SignInWithApple` | Requires Apple Developer account |
| Facebook | `Facebook` | OAuth 2.0 |
| Amazon | `LoginWithAmazon` | OAuth 2.0 |
| SAML | `SAML` | Enterprise SSO |
| OIDC | `OIDC` | Any OpenID Connect provider |

For SAML and OIDC, the configuration is more involved. Refer to the [Cognito documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-provider.html) for those providers.

## Testing locally

- Add `http://localhost:3000/callback` to both the Cognito `CallbackURLs` and the OAuth provider's authorized redirect URIs (for Google, this is in the Google Cloud Console).
- Use `http`, not `https`, for localhost. Cognito accepts plain HTTP only for localhost URLs.
- If the callback fails silently, check the browser's network tab for the redirect chain. The most common issue is a mismatch between the `redirect_uri` parameter in your authorize URL and what is configured in the Cognito app client.

## Next step

Strengthen security with [multi-factor authentication](mfa.md), or learn how [sessions and tokens](jwts.md) work.

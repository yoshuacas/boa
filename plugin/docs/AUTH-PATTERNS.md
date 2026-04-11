# Auth Patterns

Amazon Cognito patterns for the BOA stack.

---

## User Pool Configuration (required settings)

```yaml
# In SAM template
CognitoUserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: !Sub "${ProjectName}-users"
    AdminCreateUserConfig:
      AllowAdminCreateUserOnly: false     # CRITICAL: enable self-signup
    AutoVerifiedAttributes:
      - email
    UsernameAttributes:
      - email
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireLowercase: true
        RequireUppercase: true
        RequireNumbers: true
        RequireSymbols: false
    Schema:
      - Name: email
        Required: true
        Mutable: true
```

## Pre-Signup Auto-Confirm Trigger

Without this, users must verify via email (requires SES). This trigger auto-confirms.

```javascript
export const handler = async (event) => {
  event.response.autoConfirmUser = true;
  if (event.request.userAttributes.email) {
    event.response.autoVerifyEmail = true;
  }
  return event;
};
```

## Sign-Up Flow (Frontend)

```javascript
import { CognitoUserPool, CognitoUserAttribute } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: config.auth.userPoolId,
  ClientId: config.auth.userPoolWebClientId,
};
const userPool = new CognitoUserPool(poolData);

function signUp(email, password) {
  const attributes = [
    new CognitoUserAttribute({ Name: 'email', Value: email }),
  ];
  return new Promise((resolve, reject) => {
    userPool.signUp(email, password, attributes, null, (err, result) => {
      if (err) reject(err);
      else resolve(result.user);
    });
  });
}
```

## Sign-In Flow (Frontend)

```javascript
import { CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

function signIn(email, password) {
  const user = new CognitoUser({ Username: email, Pool: userPool });
  const authDetails = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}
```

## Getting JWT Token for API Calls

```javascript
function getToken() {
  const user = userPool.getCurrentUser();
  return new Promise((resolve, reject) => {
    if (!user) return reject(new Error('Not signed in'));
    user.getSession((err, session) => {
      if (err) return reject(err);
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

// Use in API calls
const token = await getToken();
const response = await fetch(`${config.apiUrl}/items`, {
  headers: { Authorization: token },
});
```

## Extracting User ID in Lambda

API Gateway Cognito authorizer validates the JWT and passes claims in the event context:

```javascript
function getUserId(event) {
  // REST API with Cognito authorizer
  return event.requestContext.authorizer.claims.sub;
}

function getUserEmail(event) {
  return event.requestContext.authorizer.claims.email;
}
```

## Social Login (Google, Apple)

Add identity providers to the user pool:

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

Configure the Hosted UI domain for OAuth redirects:

```yaml
CognitoUserPoolDomain:
  Type: AWS::Cognito::UserPoolDomain
  Properties:
    UserPoolId: !Ref CognitoUserPool
    Domain: !Sub "${ProjectName}-auth"
```

## MFA Setup

```yaml
CognitoUserPool:
  Properties:
    MfaConfiguration: OPTIONAL       # or REQUIRED
    EnabledMfas:
      - SOFTWARE_TOKEN_MFA           # TOTP (Google Authenticator, Authy)
```

Frontend TOTP setup flow:
1. Call `user.associateSoftwareToken(callbacks)` to get secret
2. Show QR code with secret
3. Call `user.verifySoftwareToken(code, friendlyName, callbacks)` to confirm

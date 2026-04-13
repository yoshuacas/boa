# Multi-Factor Authentication

Add an extra layer of security with TOTP codes (Google Authenticator, Authy). MFA is optional by default — enable it when your app handles sensitive data.

`@supabase/supabase-js` does not support MFA through BOA. MFA setup and verification require the Cognito SDK directly. Once MFA is configured, the session tokens work the same way everywhere — only the setup and sign-in challenge require the Cognito SDK.

## Enable MFA in your backend

Update the user pool configuration in your SAM template:

```yaml
CognitoUserPool:
  Properties:
    MfaConfiguration: OPTIONAL       # or REQUIRED
    EnabledMfas:
      - SOFTWARE_TOKEN_MFA           # TOTP (Google Authenticator, Authy)
```

- **OPTIONAL** — customers choose whether to enable MFA. Good for most apps where you want to offer it without forcing it.
- **REQUIRED** — every customer must set up MFA before they can sign in. Use this for apps that handle financial data, health records, or anything where regulatory compliance demands it. Customers who have not set up MFA will be forced through the setup flow on their next sign-in.

Deploy the change:

```bash
boa deploy
```

## Set up MFA for a customer

After a customer signs in, walk them through the TOTP setup. This is a three-step process: get a secret, show a QR code, verify the first code.

### 1. Get the TOTP secret

```javascript
import { CognitoUserPool } from 'amazon-cognito-identity-js';

const userPool = new CognitoUserPool({
  UserPoolId: config.auth.userPoolId,
  ClientId: config.auth.userPoolWebClientId,
});

const user = userPool.getCurrentUser();

user.getSession((err, session) => {
  if (err) {
    console.error('Session error:', err);
    return;
  }

  user.associateSoftwareToken({
    associateSecretCode: (secretCode) => {
      // Show this as a QR code using a library like qrcode.js
      const otpAuthUrl = `otpauth://totp/YourApp:${email}?secret=${secretCode}&issuer=YourApp`;
      renderQRCode(otpAuthUrl);

      // Also display the secret code as text for manual entry
      showSecretCode(secretCode);
    },
    onFailure: (err) => {
      console.error('MFA setup failed:', err);
    }
  });
});
```

Display the secret code as text alongside the QR code. Customers who cannot scan the QR (desktop-only, accessibility needs) can type the code into their authenticator app manually.

### 2. Verify the first code

After the customer scans the QR code, ask them to enter the 6-digit code from their authenticator app:

```html
<form id="mfa-verify-form">
  <label for="totp-code">Enter the 6-digit code from your authenticator app</label>
  <input type="text" id="totp-code" inputmode="numeric" pattern="[0-9]{6}"
         maxlength="6" autocomplete="one-time-code" required />
  <button type="submit">Verify</button>
</form>
```

```javascript
document.getElementById('mfa-verify-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('totp-code').value;

  user.verifySoftwareToken(code, 'My Authenticator', {
    onSuccess: () => {
      // MFA is now enabled for this customer
      showSuccess('MFA enabled. You will be asked for a code on future sign-ins.');
    },
    onFailure: (err) => {
      showError('Invalid code. Make sure the time on your phone is correct and try again.');
    }
  });
});
```

If verification fails repeatedly, the most common cause is clock skew — the customer's phone time is out of sync. TOTP codes are time-based and valid for 30-second windows. Tell the customer to check their phone's time settings (enable automatic time).

### 3. Handle MFA during sign-in

When MFA is enabled, the sign-in flow has an extra step. After the customer enters their email and password, the auth service responds with a TOTP challenge instead of a session:

```javascript
import { AuthenticationDetails, CognitoUser } from 'amazon-cognito-identity-js';

const authDetails = new AuthenticationDetails({
  Username: email,
  Password: password,
});

const cognitoUser = new CognitoUser({
  Username: email,
  Pool: userPool,
});

cognitoUser.authenticateUser(authDetails, {
  onSuccess: (session) => {
    // Sign-in complete — no MFA required or MFA already handled
    initializeApp(session);
  },

  totpRequired: () => {
    // Show the MFA input form
    showMFAForm();

    document.getElementById('mfa-signin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('mfa-code').value;

      cognitoUser.sendMFACode(code, {
        onSuccess: (session) => {
          initializeApp(session);
        },
        onFailure: (err) => {
          showError('Invalid code. Check your authenticator app and try again.');
        }
      }, 'SOFTWARE_TOKEN_MFA');
    });
  },

  onFailure: (err) => {
    showError('Sign-in failed: ' + err.message);
  }
});
```

## Recovery: lost authenticator device

If a customer loses their phone or uninstalls their authenticator app, they cannot sign in. There is no built-in recovery flow in Cognito for TOTP MFA.

Your options:

1. **Admin reset (recommended):** Build an admin endpoint or use the AWS CLI to disable MFA for the customer, then have them set it up again.

   ```bash
   aws cognito-idp admin-set-user-mfa-preference \
     --user-pool-id us-east-1_abc123 \
     --username user@example.com \
     --software-token-mfa-settings Enabled=false,PreferredMfa=false
   ```

2. **Recovery codes:** Generate and store backup codes during MFA setup that the customer can use as one-time alternatives. Cognito does not support this natively — you would need to implement it in your own Lambda function.

3. **Support flow:** Verify the customer's identity through an out-of-band channel (email to a secondary address, phone call, ID verification) before resetting MFA.

For most apps, the admin reset is sufficient. Add an admin-only API endpoint that verifies the customer's identity and calls the `admin-set-user-mfa-preference` API.

## Troubleshooting

**"Invalid code" on every attempt during setup**
The customer's phone clock is out of sync. TOTP codes depend on the current time — even a 30-second difference causes failures. Ask the customer to enable automatic time on their phone (Settings > General > Date & Time on iOS, Settings > System > Date & Time on Android).

**"Software token MFA is not enabled" error**
The user pool does not have `SOFTWARE_TOKEN_MFA` in `EnabledMfas`. Update your SAM template and redeploy.

**MFA challenge not triggered during sign-in**
If `MfaConfiguration` is `OPTIONAL` and the customer has not set up MFA, the `totpRequired` callback is never called. The sign-in goes straight to `onSuccess`. This is expected — only customers who have completed MFA setup get the challenge.

**Customer set up MFA but wants to disable it**
Use the same `admin-set-user-mfa-preference` CLI command from the recovery section. If `MfaConfiguration` is `REQUIRED`, customers cannot disable MFA — it is enforced at the user pool level.

## SMS MFA

The auth service also supports SMS-based MFA, but it requires Amazon SNS configuration, has per-message costs ($0.01-0.05 per SMS depending on region), and is less secure than TOTP (SIM-swapping attacks). TOTP is recommended unless you have customers who cannot install an authenticator app.

## Next step

Review the [API overview](/docs/api/overview) to understand how authenticated requests flow through your backend.

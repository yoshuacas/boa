import { NextRequest, NextResponse } from 'next/server';
import { getAuthMode, makeSessionCookieValue } from '@/lib/studio-auth';

function setSessionCookie(res: NextResponse, value: string): void {
  res.cookies.set('boa-studio-session', value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60, // 1 hour — matches Cognito IdToken expiry
    path: '/',
  });
}

async function loginWithToken(password: string): Promise<NextResponse> {
  const expected = process.env.STUDIO_ACCESS_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'STUDIO_ACCESS_TOKEN is not configured' }, { status: 500 });
  }
  if (!password || password !== expected) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  const sessionValue = await makeSessionCookieValue();
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, sessionValue);
  return res;
}

async function loginWithCognito(
  email: string,
  password: string,
  newPassword?: string,
  session?: string,
): Promise<NextResponse> {
  const clientId = process.env.STUDIO_COGNITO_CLIENT_ID;
  const region = process.env.STUDIO_COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';

  if (!clientId) {
    return NextResponse.json({ error: 'STUDIO_COGNITO_CLIENT_ID is not configured' }, { status: 500 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  try {
    const {
      CognitoIdentityProviderClient,
      InitiateAuthCommand,
      RespondToAuthChallengeCommand,
    } = await import('@aws-sdk/client-cognito-identity-provider');

    const client = new CognitoIdentityProviderClient({ region });

    // Step 2: complete a NEW_PASSWORD_REQUIRED challenge
    if (newPassword && session) {
      const challengeResult = await client.send(new RespondToAuthChallengeCommand({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: clientId,
        Session: session,
        ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
      }));
      const idToken = challengeResult.AuthenticationResult?.IdToken;
      if (!idToken) {
        return NextResponse.json({ error: 'Password change failed' }, { status: 401 });
      }
      const res = NextResponse.json({ ok: true });
      setSessionCookie(res, idToken);
      return res;
    }

    // Step 1: initial auth
    const result = await client.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));

    // Cognito requires a new password on first login (admin-created users)
    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return NextResponse.json(
        { challenge: 'NEW_PASSWORD_REQUIRED', session: result.Session },
        { status: 200 },
      );
    }

    const idToken = result.AuthenticationResult?.IdToken;
    if (!idToken) {
      return NextResponse.json({ error: 'Login failed — no token returned' }, { status: 401 });
    }

    // Store the Cognito IdToken as the session cookie. Middleware verifies it
    // using Cognito's public JWKS endpoint (no server secret needed at runtime).
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, idToken);
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NotAuthorizedException')) {
      return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
    }
    if (msg.includes('UserNotConfirmedException')) {
      return NextResponse.json({ error: 'Account not confirmed — check your email for a verification code' }, { status: 401 });
    }
    if (msg.includes('UserNotFoundException')) {
      return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    email?: string;
    password?: string;
    newPassword?: string;
    session?: string;
  };
  const mode = getAuthMode();

  if (mode === 'token') return loginWithToken(body.password ?? '');
  if (mode === 'cognito') return loginWithCognito(
    body.email ?? '',
    body.password ?? '',
    body.newPassword,
    body.session,
  );

  return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
}

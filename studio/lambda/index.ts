/**
 * BOA Studio Lambda handler — serves all /api/* routes for the SPA.
 *
 * Event format: API Gateway HTTP API v2 (payload format 2.0).
 * Response format: API Gateway HTTP API v2.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getAuthMode, isCognito, makeSessionCookieValue } from '@/lib/studio-auth';
import { getStudioMode } from '@/lib/studio-mode';
import {
  loadBoaConfig,
  loadBoaConfigWithRoot,
  getDsqlEndpoint,
  getStackName,
  getLambdaName,
  getBucketName,
  getApiUrl,
} from '@/lib/boa-config';
import { getAwsClients } from '@/lib/aws-clients';
import { runQuery, getTables, getTableData } from '@/lib/dsql-client';
import { getTableSchema } from '@/lib/schema-introspection';
import { listPolicies, readPolicy, writePolicy, deletePolicy } from '@/lib/cedar-policies';
import { getStackFunctions } from '@/lib/stack-functions';
import { listUsers, createUser, deleteUser, enableUser, disableUser, resetUserPassword } from '@/lib/studio-cognito';
import { getUsers, getUserCount, getActiveSessions, checkBetterAuthSchema } from '@/lib/auth-tables';
import {
  GetFunctionConfigurationCommand,
  InvokeCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  waitUntilFunctionUpdated,
} from '@aws-sdk/client-lambda';
import {
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import AdmZip from 'adm-zip';

// ── Types ─────────────────────────────────────────────────────────────────────

type LambdaResponse = APIGatewayProxyResultV2 & {
  cookies?: string[];
};

interface ParsedRequest {
  path: string;
  method: string;
  body: Record<string, unknown>;
  query: Record<string, string>;
  cookies: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(status: number, data: unknown, extraHeaders?: Record<string, string>): LambdaResponse {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(data),
    isBase64Encoded: false,
  };
}

function jsonWithCookie(status: number, data: unknown, cookieStr: string): LambdaResponse {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    cookies: [cookieStr],
    body: JSON.stringify(data),
    isBase64Encoded: false,
  };
}

function makeCookieString(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV !== 'development' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function parseCookies(cookieHeaders: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of cookieHeaders) {
    for (const part of header.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k) out[k.trim()] = rest.join('=').trim();
    }
  }
  return out;
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Auth validation ────────────────────────────────────────────────────────────

async function validateSession(sessionCookie: string | undefined): Promise<boolean> {
  const mode = getAuthMode();
  if (mode === 'none') return true;

  if (!sessionCookie) return false;

  if (mode === 'token') {
    const expected = await makeSessionCookieValue();
    return sessionCookie === expected;
  }

  if (mode === 'cognito') {
    return validateCognitoJwt(sessionCookie);
  }

  return false;
}

async function validateCognitoJwt(token: string): Promise<boolean> {
  try {
    const { CognitoJwtVerifier } = await import('aws-jwt-verify');
    const userPoolId = process.env.STUDIO_COGNITO_USER_POOL_ID;
    const clientId = process.env.STUDIO_COGNITO_CLIENT_ID;
    if (!userPoolId || !clientId) return false;

    const verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId,
    });
    await verifier.verify(token);
    return true;
  } catch {
    return false;
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────────

async function handleAuthSession(cookies: Record<string, string>): Promise<LambdaResponse> {
  const authMode = getAuthMode();
  const studioMode = getStudioMode();
  const session = cookies['boa-studio-session'];
  const authenticated = await validateSession(session);
  return json(200, { authenticated, authMode, studioMode });
}

async function handleAuthLogin(body: Record<string, unknown>): Promise<LambdaResponse> {
  const mode = getAuthMode();

  if (mode === 'token') {
    const expected = process.env.STUDIO_ACCESS_TOKEN;
    if (!expected) return json(500, { error: 'STUDIO_ACCESS_TOKEN is not configured' });
    const password = String(body.password ?? '');
    if (!password || password !== expected) return json(401, { error: 'Invalid password' });
    const sessionValue = await makeSessionCookieValue();
    return jsonWithCookie(200, { ok: true }, makeCookieString('boa-studio-session', sessionValue, 3600));
  }

  if (mode === 'cognito') {
    const clientId = process.env.STUDIO_COGNITO_CLIENT_ID;
    const region = process.env.STUDIO_COGNITO_REGION || 'us-east-1';
    if (!clientId) return json(500, { error: 'STUDIO_COGNITO_CLIENT_ID is not configured' });

    const email = String(body.email ?? '');
    const password = String(body.password ?? '');
    const newPassword = body.newPassword ? String(body.newPassword) : undefined;
    const session = body.session ? String(body.session) : undefined;

    if (!email || !password) return json(400, { error: 'Email and password required' });

    try {
      const {
        CognitoIdentityProviderClient,
        InitiateAuthCommand,
        RespondToAuthChallengeCommand,
      } = await import('@aws-sdk/client-cognito-identity-provider');

      const client = new CognitoIdentityProviderClient({ region });

      if (newPassword && session) {
        const result = await client.send(new RespondToAuthChallengeCommand({
          ChallengeName: 'NEW_PASSWORD_REQUIRED',
          ClientId: clientId,
          Session: session,
          ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
        }));
        const idToken = result.AuthenticationResult?.IdToken;
        if (!idToken) return json(401, { error: 'Password change failed' });
        return jsonWithCookie(200, { ok: true }, makeCookieString('boa-studio-session', idToken, 3600));
      }

      const result = await client.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }));

      if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        return json(200, { challenge: 'NEW_PASSWORD_REQUIRED', session: result.Session });
      }

      const idToken = result.AuthenticationResult?.IdToken;
      if (!idToken) return json(401, { error: 'Login failed — no token returned' });
      return jsonWithCookie(200, { ok: true }, makeCookieString('boa-studio-session', idToken, 3600));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAuthorizedException')) return json(401, { error: 'Incorrect email or password' });
      if (msg.includes('UserNotConfirmedException')) return json(401, { error: 'Account not confirmed' });
      if (msg.includes('UserNotFoundException')) return json(401, { error: 'Incorrect email or password' });
      return json(401, { error: 'Login failed' });
    }
  }

  return json(500, { error: 'Auth not configured' });
}

async function handleAuthLogout(): Promise<LambdaResponse> {
  return jsonWithCookie(200, { ok: true }, makeCookieString('boa-studio-session', '', 0));
}

async function handleConfig(): Promise<LambdaResponse> {
  const cfg = await loadBoaConfig();
  if (!cfg) return json(404, { error: 'No .boa/config.json found' });
  return json(200, {
    stackName: getStackName(cfg),
    region: cfg.region || 'us-east-1',
    dsqlEndpoint: getDsqlEndpoint(cfg),
    lambdaName: getLambdaName(cfg),
    bucket: getBucketName(cfg),
    apiUrl: getApiUrl(cfg),
    authProvider: cfg.authProvider || 'better-auth',
  });
}

async function handleOverview(): Promise<LambdaResponse> {
  const result = await loadBoaConfigWithRoot();
  if (!result) return json(404, { error: 'No .boa/config.json found' });

  const { config: cfg, projectRoot } = result;
  const stackName = getStackName(cfg);
  const region = cfg.region || 'us-east-1';

  let stackStatus: string | null = null;
  let stackLastUpdated: string | null = null;
  let policyCount = 0;

  try {
    const { cfn } = getAwsClients(cfg);
    const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = res.Stacks?.[0];
    stackStatus = stack?.StackStatus ?? null;
    const ts = stack?.LastUpdatedTime ?? stack?.CreationTime ?? null;
    stackLastUpdated = ts ? ts.toISOString() : null;
  } catch {
    // Stack may not be deployed yet
  }

  try {
    const policies = await listPolicies(cfg, projectRoot);
    policyCount = policies.length;
  } catch {
    // Ignore policy errors
  }

  return json(200, {
    stackName,
    region,
    dsqlEndpoint: getDsqlEndpoint(cfg),
    lambdaName: getLambdaName(cfg),
    bucket: getBucketName(cfg),
    authProvider: cfg.authProvider || 'better-auth',
    policyCount,
    stackStatus,
    stackLastUpdated,
  });
}

async function handleAuthData(): Promise<LambdaResponse> {
  const cfg = await loadBoaConfig();
  if (!cfg) return json(404, { error: 'No .boa/config.json found' });

  const endpoint = getDsqlEndpoint(cfg);
  if (!endpoint) return json(200, { endpoint: '', users: [], userCount: 0, activeSessions: 0, hasSchema: false });

  const hasSchema = await checkBetterAuthSchema(cfg);
  if (!hasSchema) return json(200, { endpoint, users: [], userCount: 0, activeSessions: 0, hasSchema: false });

  try {
    const [users, userCount, activeSessions] = await Promise.all([
      getUsers(cfg),
      getUserCount(cfg),
      getActiveSessions(cfg),
    ]);
    return json(200, { endpoint, users, userCount, activeSessions, hasSchema: true });
  } catch (err: unknown) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleDb(body: Record<string, unknown>): Promise<LambdaResponse> {
  const { action, sql, tableName, limit, offset } = body;

  const cfg = await loadBoaConfig();
  if (!cfg) return json(404, { error: 'No .boa/config.json found' });

  try {
    if (action === 'query') {
      const result = await runQuery(cfg, String(sql ?? ''));
      return json(200, result);
    }
    if (action === 'tables') {
      const tables = await getTables(cfg);
      return json(200, { tables });
    }
    if (action === 'table-data') {
      const result = await getTableData(cfg, String(tableName ?? ''), Number(limit ?? 100), Number(offset ?? 0));
      return json(200, result);
    }
    if (action === 'schema') {
      const schema = await getTableSchema(cfg, String(tableName ?? ''));
      return json(200, schema);
    }
    if (action === 'ddl') {
      const result = await runQuery(cfg, String(sql ?? ''));
      if (result.error) return json(400, { error: result.error });
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown action' });
  } catch (err: unknown) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleLambda(body: Record<string, unknown>): Promise<LambdaResponse> {
  const { action, functionName, payload, startTime, endTime } = body;

  const cfg = await loadBoaConfig();
  if (!cfg) return json(404, { error: 'No .boa/config.json found' });

  if (action === 'stack-functions') {
    const functions = await getStackFunctions(cfg);
    return json(200, { functions });
  }

  const { lambda, logs } = getAwsClients(cfg);
  if (!functionName) return json(400, { error: 'functionName is required' });
  const fnName = String(functionName);

  try {
    if (action === 'config') {
      const result = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fnName }));
      return json(200, {
        functionName: result.FunctionName,
        runtime: result.Runtime,
        handler: result.Handler,
        memorySize: result.MemorySize,
        timeout: result.Timeout,
        lastModified: result.LastModified,
        codeSize: result.CodeSize,
        description: result.Description,
        environment: result.Environment?.Variables || {},
      });
    }
    if (action === 'logs') {
      const logGroupName = `/aws/lambda/${fnName}`;
      const since = Number(startTime ?? Date.now() - 30 * 60 * 1000);
      const until = endTime ? Number(endTime) : undefined;
      const allEvents: { timestamp: number; message: string; logStreamName: string }[] = [];
      let nextToken: string | undefined;
      // Paginate up to 10 pages (5 000 events) to ensure recent events aren't dropped.
      for (let page = 0; page < 10; page++) {
        const result = await logs.send(new FilterLogEventsCommand({
          logGroupName,
          startTime: since,
          endTime: until,
          limit: 500,
          nextToken,
        }));
        for (const e of result.events ?? []) {
          allEvents.push({
            timestamp: e.timestamp!,
            message: e.message?.trim() ?? '',
            logStreamName: e.logStreamName ?? '',
          });
        }
        if (!result.nextToken) break;
        nextToken = result.nextToken;
      }
      return json(200, { events: allEvents });
    }
    if (action === 'invoke') {
      const result = await lambda.send(new InvokeCommand({
        FunctionName: fnName,
        Payload: payload ? JSON.stringify(payload) : undefined,
      }));
      const responsePayload = result.Payload
        ? JSON.parse(Buffer.from(result.Payload).toString('utf-8'))
        : null;
      return json(200, { statusCode: result.StatusCode, functionError: result.FunctionError, payload: responsePayload });
    }
    return json(400, { error: 'Unknown action' });
  } catch (err: unknown) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleS3(body: Record<string, unknown>): Promise<LambdaResponse> {
  const { action, prefix, key, expiresIn } = body;

  const cfg = await loadBoaConfig();
  if (!cfg) return json(404, { error: 'No .boa/config.json found' });

  const bucket = getBucketName(cfg);
  if (!bucket) return json(400, { error: 'No S3 bucket in config' });

  const { s3 } = getAwsClients(cfg);

  try {
    if (action === 'list') {
      const result = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: String(prefix ?? ''),
        Delimiter: '/',
      }));
      return json(200, {
        folders: (result.CommonPrefixes || []).map(p => p.Prefix),
        files: (result.Contents || []).map(f => ({
          key: f.Key,
          size: f.Size,
          lastModified: f.LastModified,
          etag: f.ETag,
        })),
        isTruncated: result.IsTruncated,
      });
    }
    if (action === 'presign') {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: String(key ?? '') }),
        { expiresIn: Number(expiresIn ?? 3600) }
      );
      return json(200, { url });
    }
    if (action === 'delete') {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: String(key ?? '') }));
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown action' });
  } catch (err: unknown) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function handlePolicies(
  req: ParsedRequest,
): Promise<LambdaResponse> {
  const { method, path, body, query } = req;
  const filename = query['filename'];

  const result = await loadBoaConfigWithRoot();
  if (!result) return json(404, { error: 'No BOA config found' });
  const { config: cfg, projectRoot } = result;

  try {
    if (method === 'GET') {
      if (path === '/api/policies/deploy') return json(405, { error: 'Method not allowed' });

      if (filename) {
        const policy = await readPolicy(cfg, projectRoot, filename);
        if (!policy) return json(404, { error: 'Not found' });
        return json(200, policy);
      }
      const policies = await listPolicies(cfg, projectRoot);
      return json(200, { policies });
    }

    if (method === 'PUT') {
      if (!filename) return json(400, { error: 'filename required' });
      if (!projectRoot) return json(400, { error: 'Local saves are not available in cloud mode' });
      const content = String(body.content ?? '');
      if (typeof content !== 'string') return json(400, { error: 'content required' });
      await writePolicy(projectRoot, filename, content);
      return json(200, { ok: true });
    }

    if (method === 'POST' && path === '/api/policies') {
      if (!projectRoot) return json(400, { error: 'Local saves are not available in cloud mode' });
      const fname = String(body.filename ?? '');
      const content = String(body.content ?? '');
      if (!fname || typeof content !== 'string') return json(400, { error: 'filename and content required' });
      await writePolicy(projectRoot, fname, content);
      return json(200, { ok: true });
    }

    if (method === 'POST' && path === '/api/policies/deploy') {
      const fname = String(body.filename ?? '');
      const content = String(body.content ?? '');
      if (!fname || typeof content !== 'string') return json(400, { error: 'filename and content required' });

      // Save locally if we have a project root
      if (projectRoot) {
        try { await writePolicy(projectRoot, fname, content); } catch { /* ignore local save failure */ }
      }

      // Find the API Lambda
      const fns = await getStackFunctions(cfg);
      const apiFn = fns.find(f => f.kind === 'api');
      if (!apiFn) return json(404, { error: 'No API Lambda function found in stack' });

      const { lambda } = getAwsClients(cfg);

      // Download current Lambda code
      const fn = await lambda.send(new GetFunctionCommand({ FunctionName: apiFn.physicalId }));
      const codeUrl = fn.Code?.Location;
      if (!codeUrl) return json(500, { error: 'Could not get Lambda code URL' });

      const resp = await fetch(codeUrl);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      let zipBuffer = Buffer.from(await resp.arrayBuffer());

      // Patch the zip
      const zip = new AdmZip(zipBuffer);
      const entryPath = `policies/${fname}`;
      const existing = zip.getEntry(entryPath);
      if (existing) zip.updateFile(entryPath, Buffer.from(content, 'utf-8'));
      else zip.addFile(entryPath, Buffer.from(content, 'utf-8'));
      zipBuffer = zip.toBuffer();

      // Upload patched zip
      await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: apiFn.physicalId, ZipFile: zipBuffer }));
      await waitUntilFunctionUpdated({ client: lambda, maxWaitTime: 60 }, { FunctionName: apiFn.physicalId });

      return json(200, { ok: true, functionName: apiFn.physicalId });
    }

    if (method === 'DELETE') {
      if (!filename) return json(400, { error: 'filename required' });
      if (!projectRoot) return json(400, { error: 'Deleting policies is not supported in cloud mode' });
      await deletePolicy(projectRoot, filename);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err: unknown) {
    return json(500, { error: String(err) });
  }
}

async function handleAdmin(
  method: string,
  body: Record<string, unknown>,
  query: Record<string, string>,
): Promise<LambdaResponse> {
  if (!isCognito()) return json(403, { error: 'Admin API requires STUDIO_AUTH=cognito' });

  try {
    if (method === 'GET') {
      const users = await listUsers();
      return json(200, { users });
    }
    if (method === 'POST') {
      const email = String(body.email ?? '');
      if (!email) return json(400, { error: 'email required' });
      await createUser(email);
      return json(200, { ok: true });
    }
    if (method === 'DELETE') {
      const username = query['username'];
      if (!username) return json(400, { error: 'username required' });
      await deleteUser(username);
      return json(200, { ok: true });
    }
    if (method === 'PATCH') {
      const username = query['username'];
      if (!username) return json(400, { error: 'username required' });
      const action = String(body.action ?? '');
      if (action === 'enable') await enableUser(username);
      else if (action === 'disable') await disableUser(username);
      else if (action === 'reset-password') await resetUserPassword(username);
      else return json(400, { error: 'Unknown action' });
      return json(200, { ok: true });
    }
    return json(405, { error: 'Method not allowed' });
  } catch (err: unknown) {
    return json(500, { error: String(err) });
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

export const handler = async (event: APIGatewayProxyEventV2): Promise<LambdaResponse> => {
  const path = event.rawPath;
  const method = event.requestContext.http.method.toUpperCase();
  const cookies = parseCookies(event.cookies ?? []);
  const body = parseBody(event);
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.queryStringParameters ?? {})) {
    if (v !== undefined) query[k] = v;
  }

  const req: ParsedRequest = { path, method, body, query, cookies };

  // Auth login endpoint is public
  if (path === '/api/auth/login' && method === 'POST') {
    return handleAuthLogin(body);
  }

  // Session endpoint is public (returns auth status)
  if (path === '/api/auth/session' && method === 'GET') {
    return handleAuthSession(cookies);
  }

  // All other /api/* endpoints require authentication
  const session = cookies['boa-studio-session'];
  const authed = await validateSession(session);
  if (!authed) return json(401, { error: 'Unauthorized' });

  try {
    if (path === '/api/auth/logout' && method === 'POST') return handleAuthLogout();
    if (path === '/api/config' && method === 'GET') return handleConfig();
    if (path === '/api/overview' && method === 'GET') return handleOverview();
    if (path === '/api/auth-data' && method === 'GET') return handleAuthData();
    if (path === '/api/db' && method === 'POST') return handleDb(body);
    if (path === '/api/lambda' && method === 'POST') return handleLambda(body);
    if (path === '/api/s3' && method === 'POST') return handleS3(body);
    if (path.startsWith('/api/policies')) return handlePolicies(req);
    if (path.startsWith('/api/admin')) return handleAdmin(method, body, query);

    return json(404, { error: 'Not found' });
  } catch (err: unknown) {
    console.error('[studio] Unhandled error:', err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
};

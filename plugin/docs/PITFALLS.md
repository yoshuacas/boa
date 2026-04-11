# BOA Known Pitfalls

Every failure below was observed in real AI agent builds. Each one cost hours to debug.

---

## Category 1: Authentication (Cognito)

### 1.1 Self-signup disabled by default

**Frequency**: Every build
**Severity**: CRITICAL

**What happens**: Users get "User is not authorized" when trying to sign up.
**Root cause**: Cognito defaults `AllowAdminCreateUserOnly` to `true`. Only admins can create users.
**Fix**: Set `AllowAdminCreateUserOnly: false` in the user pool config.
**Prevention**: BOA template sets this automatically.

### 1.2 Users stuck in UNCONFIRMED state

**Frequency**: 8 out of 10 builds
**Severity**: CRITICAL

**What happens**: Users sign up but can't sign in. Cognito shows status `UNCONFIRMED`.
**Root cause**: No auto-confirmation mechanism. Without a pre-signup trigger, users must verify via email/SMS, which requires SES setup.
**Fix**: Deploy a pre-signup Lambda trigger that returns `event.response.autoConfirmUser = true`.
**Prevention**: BOA template includes this trigger inline.

### 1.3 Cognito SDK fails in browser (Vite)

**Frequency**: 5 out of 10 builds
**Severity**: HIGH

**What happens**: `ReferenceError: global is not defined` in the browser console.
**Root cause**: The Cognito SDK (amazon-cognito-identity-js) references `global`, which doesn't exist in browsers. Vite doesn't polyfill it.
**Fix**: Add `define: { global: 'globalThis' }` to `vite.config.js`.
**Prevention**: BOA SKILL.md includes this in Step 5.

### 1.4 Wrong API Gateway type for Cognito authorizer

**Frequency**: 4 out of 10 builds
**Severity**: HIGH

**What happens**: Cognito authorizer returns 500 or doesn't validate tokens.
**Root cause**: Agent creates HTTP API (v2) instead of REST API (v1). HTTP API uses JWT authorizers with different config; Cognito authorizers only work with REST API.
**Fix**: Use `AWS::Serverless::Api` with `Auth.DefaultAuthorizer: MyCognitoAuth` in SAM.
**Prevention**: BOA template uses REST API exclusively.

### 1.5 Lambda authorizer context path differs from Cognito

**Frequency**: 3 out of 10 builds
**Severity**: HIGH

**What happens**: Handler reads `event.requestContext.authorizer.claims.sub` and gets `undefined`. User ID falls back to `anonymous`, breaking row-level security.
**Root cause**: Lambda authorizers place context values at `event.requestContext.authorizer.<key>` (flat object), not `event.requestContext.authorizer.claims.<key>` (Cognito authorizer path). BOA uses a Lambda authorizer, so userId is at `event.requestContext.authorizer.userId`.
**Fix**: Read from the Lambda authorizer path: `event.requestContext.authorizer.userId`. For robustness, fall back to `authorizer.claims?.sub`.
**Prevention**: BOA PostgREST handler reads from both paths automatically.

---

## Category 2: Database (Aurora DSQL)

### 2.1 Hardcoded database credentials

**Frequency**: 6 out of 10 builds
**Severity**: CRITICAL

**What happens**: Connection works during dev, fails in production. Or credentials leak.
**Root cause**: Agent hardcodes username/password instead of using IAM authentication.
**Fix**: Use `@aws-sdk/dsql-signer` to generate IAM auth tokens at runtime.
**Prevention**: BOA Lambda templates always use IAM auth.

```javascript
import { DsqlSigner } from '@aws-sdk/dsql-signer';
const signer = new DsqlSigner({ hostname: endpoint, region });
const token = await signer.getDbConnectAdminAuthToken();
```

### 2.2 Connection exhaustion in Lambda

**Frequency**: 3 out of 10 builds
**Severity**: HIGH

**What happens**: Database errors under load: "too many connections".
**Root cause**: Each Lambda invocation opens a new connection. With concurrency, connections pile up.
**Fix**: Reuse connections across invocations by initializing the pool outside the handler. DSQL supports many concurrent connections but the pool should still be bounded.
**Prevention**: BOA Lambda template initializes connection pool at module scope.

### 2.3 Missing indexes on foreign key columns

**Frequency**: 5 out of 10 builds
**Severity**: MEDIUM

**What happens**: Queries slow down as data grows. JOINs and WHERE clauses on foreign keys do full table scans.
**Root cause**: PostgreSQL does NOT automatically index foreign key columns (unlike the primary key).
**Fix**: Always create indexes on foreign key columns.
**Prevention**: BOA architecture doc includes indexes in every schema example.

---

## Category 3: Deployment & Packaging

### 3.1 AWS_REGION as Lambda environment variable

**Frequency**: 7 out of 10 builds
**Severity**: HIGH

**What happens**: Lambda function fails with confusing errors or uses wrong region.
**Root cause**: `AWS_REGION` is a reserved Lambda environment variable. Setting it in CloudFormation silently conflicts.
**Fix**: Use `REGION_NAME` (or any non-reserved name) for your custom region variable.
**Prevention**: BOA template uses `REGION_NAME`.

### 3.2 Python Lambda with native dependencies

**Frequency**: 4 out of 10 builds
**Severity**: HIGH

**What happens**: Lambda import error: "Unable to import module" for psycopg2, numpy, etc.
**Root cause**: Python packages with C extensions (psycopg2, numpy) compile platform-specific binaries. If built on macOS/Windows, they fail on Lambda's Amazon Linux.
**Fix**: Use Node.js instead. The AWS SDK for JavaScript has no native dependencies.
**Prevention**: BOA enforces Node.js 20.x exclusively.

### 3.3 SAM build fails with no package.json

**Frequency**: 3 out of 10 builds
**Severity**: MEDIUM

**What happens**: `sam build` fails because it can't find dependencies.
**Root cause**: Lambda function directory missing `package.json` or agent forgot `npm install`.
**Fix**: Ensure `package.json` exists in the Lambda code directory with all dependencies listed.
**Prevention**: BOA lambda-templates include a complete `package.json`.

---

## Category 4: Frontend & Hosting

### 4.1 Amplify SPA redirect breaks static assets

**Frequency**: 5 out of 10 builds
**Severity**: HIGH

**What happens**: CSS, JS, and images return HTML (the index.html) instead of their actual content.
**Root cause**: Agent sets redirect rule `/<*>` → `/index.html` which catches everything, including `.js` and `.css` files.
**Fix**: Use redirect source `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|svg|txt|webp|woff2?)$)([^.]+$)/>` with status `200`.
**Prevention**: BOA template includes the correct regex redirect.

### 4.2 CORS errors on API calls

**Frequency**: 4 out of 10 builds
**Severity**: HIGH

**What happens**: Browser console shows "Access-Control-Allow-Origin" errors.
**Root cause**: Lambda doesn't return CORS headers, or API Gateway OPTIONS preflight isn't configured.
**Fix**: Return `Access-Control-Allow-Origin: *` (or specific origin) from Lambda. Enable CORS on the API Gateway resource.
**Prevention**: BOA Lambda templates include CORS headers. BOA SAM template enables `Cors` on the API.

---

## Category 5: S3 Storage

### 5.1 Public S3 bucket

**Frequency**: 3 out of 10 builds
**Severity**: CRITICAL

**What happens**: All uploaded files are publicly accessible. Data breach risk.
**Root cause**: Agent sets bucket policy to public or disables Block Public Access.
**Fix**: Keep `BlockPublicAccess` enabled (all four settings). Use presigned URLs for upload/download.
**Prevention**: BOA template enforces Block Public Access. Lambda templates use presigned URLs exclusively.

### 5.2 Presigned URL expiration too short

**Frequency**: 2 out of 10 builds
**Severity**: LOW

**What happens**: Upload fails with "Request has expired" for large files.
**Root cause**: Default presigned URL expiration is 15 minutes, which may not be enough for large file uploads on slow connections.
**Fix**: Set expiration to 1 hour for uploads: `expiresIn: 3600`.
**Prevention**: BOA presigned-upload template uses 1-hour expiration.

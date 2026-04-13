# Lambda Function URLs and Extensions

## Overview

Replace API Gateway REST with Lambda Function URLs as the
default API layer, and introduce an extension system that
lets developers add optional infrastructure capabilities
via the CLI. The default backend becomes leaner and cheaper
— Lambda Function URLs are free (included in Lambda pricing)
vs API Gateway REST at $3.50/1M requests. Extensions are
purely additive SAM template resources that can be added
and removed without changing Lambda handler code.

The first extension is `api-gateway`, which restores API
Gateway REST for developers who need rate limiting, WAF,
usage plans, or custom domains. Future extensions (Phase 2)
include `custom-domain`, `monitoring`, and `cdn`.

## Current CX / Concepts

### Default Backend Template

The SAM template (`cli/templates/backend.yaml`, lines
100–137) creates a REST API Gateway with a BOA Lambda
authorizer:

```yaml
Api:
  Type: AWS::Serverless::Api
  Properties:
    Name: !Sub '${ProjectName}-api'
    StageName: prod
    Auth:
      DefaultAuthorizer: BoaAuthorizer
      Authorizers:
        BoaAuthorizer:
          FunctionArn: !GetAtt AuthorizerFunction.Arn
          FunctionPayloadType: REQUEST
    Cors: ...
    GatewayResponses: ...
```

The template also deploys a separate authorizer Lambda
(`AuthorizerFunction`, lines 141–151) that re-exports
`pgrest.authorizer` from the pgrest-lambda npm package.
API Gateway invokes this authorizer on every request,
which validates the JWT and returns an IAM policy plus
`{role, userId, email}` context to the downstream handler.

### Cost Problem

At 100K monthly active users generating ~99.1M API
requests/month, API Gateway costs ~$347/mo — 38% of the
total bill. pgrest-lambda already handles JWT validation,
CORS, and request routing internally. API Gateway is an
expensive pass-through that adds latency and cost without
providing features most early-stage apps need.

### Config Format

`boa init` writes `.boa/config.json` with `apiUrl` pointing
to the API Gateway endpoint:

```json
{
  "apiUrl": "https://xxx.execute-api.us-east-1.amazonaws.com/prod"
}
```

### Event Format

The current backend uses API Gateway REST API proxy
integration, which sends Lambda a **v1.0 payload format**:

```json
{
  "httpMethod": "GET",
  "path": "/rest/v1/todos",
  "resource": "/{proxy+}",
  "queryStringParameters": { "select": "*" },
  "headers": { "Authorization": "Bearer ..." },
  "requestContext": {
    "authorizer": {
      "role": "authenticated",
      "userId": "abc-123",
      "email": "user@example.com"
    }
  },
  "body": null
}
```

Key fields used by the handler code:

- `index.mjs`: `event.path` (line 6)
- `presigned-upload.mjs`: `event.httpMethod` (line 39),
  `event.resource || event.path` (line 44),
  `event.requestContext?.authorizer?.userId` (line 46)
- pgrest-lambda internals: `event.httpMethod`,
  `event.path`, `event.headers`, `event.body`,
  `event.queryStringParameters`,
  `event.requestContext.authorizer.*`

## Proposed CX / CX Specification

### Default Backend (Function URLs)

After this change, `boa init` creates a backend with a
Lambda Function URL instead of API Gateway. No API Gateway,
no authorizer Lambda. pgrest-lambda handles JWT validation,
CORS, and routing internally.

The API URL format changes from:
```
https://xxx.execute-api.us-east-1.amazonaws.com/prod
```
to:
```
https://<url-id>.lambda-url.<region>.on.aws/
```

Frontend apps using `@supabase/supabase-js` continue to
work — they only reference the URL from `.boa/config.json`.

### `boa extend <name>`

Add an extension to the current project.

```
boa extend api-gateway
```

**Arguments:**
- `<name>` — Extension name. Must match an extension in the
  registry.

**Steps:**

1. Read `.boa/config.json`. Error if missing:
   `Error: .boa/config.json not found. Run 'boa init' first.`
2. Validate the extension name exists in the registry. Error
   if unknown:
   `Error: Unknown extension 'foo'. Run 'boa extensions' to see available extensions.`
3. Check if the extension is already enabled. Error if so:
   `Error: Extension 'api-gateway' is already enabled.`
4. Merge the extension's SAM template fragment into the
   project's template.
5. Run `boa deploy` to apply the changes.
6. Update `.boa/config.json`:
   - Add extension to the `extensions` array.
   - Update `apiUrl` if the extension provides a new one
     (API Gateway URL replaces Function URL).
7. Print success message.

**Validation rules:**
- Must be run from a BOA project directory (`.boa/config.json`
  exists).
- Extension name must be in the registry.
- Extension must not already be enabled.

**Error messages:**
- Missing config:
  `Error: .boa/config.json not found. Run 'boa init' first.`
- Unknown extension:
  `Error: Unknown extension '<name>'. Run 'boa extensions' to see available extensions.`
- Already enabled:
  `Error: Extension '<name>' is already enabled.`

**Example output:**
```
Adding extension 'api-gateway'...

Building SAM application...
  ...SAM build output...

Deploying...
  ...SAM deploy output...

Updating configuration...

Extension 'api-gateway' enabled.
API URL: https://xxx.execute-api.us-east-1.amazonaws.com/prod
```

### `boa remove <name>`

Remove an extension from the current project.

```
boa remove api-gateway
```

**Arguments:**
- `<name>` — Extension name to remove.

**Steps:**

1. Read `.boa/config.json`. Error if missing.
2. Check if the extension is currently enabled. Error if not:
   `Error: Extension 'api-gateway' is not enabled.`
3. Remove the extension's SAM resources from the project's
   template.
4. Run `boa deploy` to apply the changes.
5. Update `.boa/config.json`:
   - Remove extension from the `extensions` array.
   - Revert `apiUrl` to the Function URL.
6. Print success message.

**Validation rules:**
- Must be run from a BOA project directory.
- Extension must currently be enabled.

**Error messages:**
- Missing config:
  `Error: .boa/config.json not found. Run 'boa init' first.`
- Not enabled:
  `Error: Extension '<name>' is not enabled.`

**Example output:**
```
Removing extension 'api-gateway'...

Building SAM application...
  ...SAM build output...

Deploying...
  ...SAM deploy output...

Updating configuration...

Extension 'api-gateway' removed.
API URL: https://abc123.lambda-url.us-east-1.on.aws/
```

### `boa extensions`

List available extensions and their status.

```
boa extensions
```

**Steps:**

1. Read `.boa/config.json` (optional — works without it,
   just shows no enabled status).
2. Read the extension registry.
3. Print each extension with its status and description.

**Example output (no project):**
```
Available extensions:

  api-gateway    API Gateway REST with rate limiting, WAF, usage plans
```

**Example output (with project, none enabled):**
```
Available extensions:

  api-gateway    API Gateway REST with rate limiting, WAF, usage plans

Enabled: (none)
```

**Example output (with api-gateway enabled):**
```
Available extensions:

  api-gateway    API Gateway REST with rate limiting, WAF, usage plans  [enabled]

Enabled: api-gateway
```

### CLI Help Update

The `boa --help` output adds three commands:

```
Commands:
  init <name>       Scaffold project, deploy stack, write config
  deploy            Rebuild and redeploy the stack
  migrate           Apply pending SQL migrations
  verify            Check all stack components
  teardown          Destroy the stack (with confirmation)
  status            Show stack info, tables, pending migrations
  check             Check required tools and AWS credentials
  extend <name>     Add an infrastructure extension
  remove <name>     Remove an infrastructure extension
  extensions        List available extensions
  feedback          Submit feedback to improve BOA
```

### `boa verify` Update

The verify command's "Checking API Gateway..." step must
work with both Function URLs and API Gateway. The check
name changes to "Checking API endpoint..." and the logic
remains the same: `curl` the `apiUrl` from config and
expect HTTP 401 or 403.

**Example output (Function URL):**
```
Checking API endpoint...
  [PASS] API returns 401 Unauthorized (not 500)
```

**Example output (API Gateway extension):**
```
Checking API endpoint...
  [PASS] API returns 401 Unauthorized (not 500)
```

### `boa status` Update

The status output uses the `apiUrl` from config, which now
reflects whether a Function URL or API Gateway is in use:

```
  API URL:     https://abc123.lambda-url.us-east-1.on.aws/
  Extensions:  (none)
```

Or with the api-gateway extension:

```
  API URL:     https://xxx.execute-api.us-east-1.amazonaws.com/prod
  Extensions:  api-gateway
```

### Migration Path for Existing Projects

Existing projects deployed with API Gateway continue
working — `boa deploy` uses whatever template is bundled
with the CLI version. When a developer upgrades the CLI
to a version with Function URLs as default:

1. The next `boa deploy` switches the template to use
   Function URLs. API Gateway resources are removed from
   the CloudFormation stack.
2. The `apiUrl` in `.boa/config.json` updates to the
   Function URL.
3. The developer can run `boa extend api-gateway` if they
   want API Gateway back.

This is a **breaking change for existing deployments** —
the API URL changes. Frontends pointing to the old API
Gateway URL must update their config. The CLI should warn:

```
Deploying stack 'my-app' in region 'us-east-1'...

  ⚠ This version of boa uses Lambda Function URLs by default.
    Your API URL will change. Update your frontend config after deploy.

Building SAM application...
```

This warning is shown when `.boa/config.json` has an
`apiUrl` matching the API Gateway pattern
(`execute-api.*.amazonaws.com`) and no `extensions` array
with `api-gateway`.

## Technical Design

### Event Format Normalization

Lambda Function URLs use **payload format version 2.0**,
which has a different event structure than the REST API
Gateway v1.0 format used today:

| Field | REST API v1.0 | Function URL v2.0 |
|-------|--------------|-------------------|
| HTTP method | `event.httpMethod` | `event.requestContext.http.method` |
| Path | `event.path` | `event.rawPath` |
| Resource | `event.resource` | N/A (`routeKey` is `$default`) |
| Query string | `event.queryStringParameters` | `event.queryStringParameters` (same) |
| Headers | `event.headers` | `event.headers` (same) |
| Body | `event.body` | `event.body` (same) |
| Authorizer context | `event.requestContext.authorizer.*` | `null` (no gateway authorizer) |
| Version | `"1.0"` (implicit) | `"2.0"` |

This format difference affects:

1. **`index.mjs`** — uses `event.path` (line 6) to route
   `/upload` and `/download` to the presigned upload handler.
2. **`presigned-upload.mjs`** — uses `event.httpMethod`
   (line 39), `event.resource || event.path` (line 44),
   and `event.requestContext?.authorizer?.userId` (line 46).
3. **pgrest-lambda internals** — uses `event.httpMethod`,
   `event.path`, and `event.requestContext.authorizer.*`
   for routing, JWT extraction, and claim forwarding.

**Resolution: pgrest-lambda event normalization.**

The pgrest-lambda npm package (`createPgrest()`) will be
updated to detect the event version and normalize v2.0
events to the v1.0 shape before processing. This is a
package-level change — the handler files (`index.mjs`,
`authorizer.mjs`, `presigned-upload.mjs`) do not change.

Detection is straightforward:

```javascript
function isV2Event(event) {
  return event.version === '2.0';
}

function normalizeEvent(event) {
  if (!isV2Event(event)) return event;
  return {
    ...event,
    httpMethod: event.requestContext.http.method,
    path: event.rawPath,
    resource: event.rawPath,
    // queryStringParameters, headers, body are the same
  };
}
```

The normalized event is passed through the pgrest-lambda
handler chain. This approach means:

- `index.mjs` sees `event.path` as expected.
- `presigned-upload.mjs` sees `event.httpMethod` and
  `event.resource` as expected.
- `event.requestContext.authorizer` is `null` with Function
  URLs, but pgrest-lambda already validates JWTs from the
  `Authorization` header when no authorizer context is
  present (this is how anon-key requests work today).

The normalization must happen in the `pgrest.handler()`
entry point, not in a wrapper. The `index.mjs` handler
accesses `event.path` **before** calling `pgrest.handler()`.
Therefore, pgrest-lambda must export a `normalizeEvent`
utility, and `index.mjs` must call it:

```javascript
import { createPgrest } from 'pgrest-lambda';
import { handler as uploadHandler } from './presigned-upload.mjs';

const pgrest = createPgrest();

export async function handler(rawEvent) {
  const event = pgrest.normalizeEvent(rawEvent);
  const path = event.path || '';
  if (path === '/upload' || path === '/download') {
    return uploadHandler(event);
  }
  return pgrest.handler(event);
}
```

This is a **one-line change** to `index.mjs` — adding the
`normalizeEvent` call. `presigned-upload.mjs` and
`authorizer.mjs` do not change (presigned-upload receives
the already-normalized event; authorizer is only used with
the API Gateway extension where events are already v1.0).

### SAM Template Changes (Default Backend)

**Remove from `cli/templates/backend.yaml`:**

1. `Api` resource (`AWS::Serverless::Api`, lines 101–137)
2. `AuthorizerFunction` resource
   (`AWS::Serverless::Function`, lines 141–151)
3. `AuthorizerFunctionPermission` resource
   (`AWS::Lambda::Permission`, lines 153–158)
4. `Events` section on `ApiFunction` (lines 202–222):
   `ProxyRoot`, `ProxyPlus`, `AuthProxy`
5. `ApiUrl` output (line 251–253) that references `${Api}`

**Add to `cli/templates/backend.yaml`:**

1. `FunctionUrlConfig` on `ApiFunction`:

```yaml
ApiFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub '${ProjectName}-api'
    Handler: index.handler
    CodeUri: ./lambda/
    FunctionUrlConfig:
      AuthType: NONE
      Cors:
        AllowHeaders:
          - Content-Type
          - Authorization
          - apikey
          - Prefer
          - Accept
          - x-client-info
          - X-Client-Info
          - X-Supabase-Api-Version
          - content-profile
          - accept-profile
        AllowMethods:
          - GET
          - POST
          - PUT
          - PATCH
          - DELETE
        AllowOrigins:
          - '*'
        MaxAge: 600
    Environment:
      Variables:
        DSQL_ENDPOINT: !GetAtt DsqlCluster.Endpoint
        REGION_NAME: !Ref 'AWS::Region'
        BUCKET_NAME: !Ref StorageBucket
        USER_POOL_ID: !Ref UserPool
        USER_POOL_CLIENT_ID: !Ref UserPoolClient
        JWT_SECRET: !Sub '{{resolve:ssm:/${ProjectName}/jwt-secret}}'
        AUTH_PROVIDER: cognito
        POLICIES_PATH: ./policies
    # ... Policies unchanged
```

Lambda Function URLs handle OPTIONS preflight requests
automatically when CORS is configured, so OPTIONS is not
listed in `AllowMethods`.

`AuthType: NONE` makes the Function URL publicly
accessible. pgrest-lambda handles JWT validation
internally — the anon key provides read access, the
Authorization header with a Cognito-minted BOA JWT
provides authenticated access, and the service role key
provides admin access. This is the same security model as
today; the only difference is that JWT validation happens
inside the Lambda function rather than in a separate
authorizer Lambda.

2. New `Outputs` entry:

```yaml
Outputs:
  ApiFunctionUrl:
    Description: Lambda Function URL endpoint
    Value: !GetAtt ApiFunctionUrl.FunctionUrl
```

SAM automatically creates a `AWS::Lambda::Url` resource
named `<FunctionLogicalId>Url` when `FunctionUrlConfig` is
present. For `ApiFunction`, this is `ApiFunctionUrl`.

**Keep unchanged:**

- `DsqlCluster` — Aurora DSQL
- `UserPool` and `UserPoolClient` — Cognito auth
- `PreSignUpFunction` and `PreSignUpPermission` — auto-confirm
- `StorageBucket` — S3 storage
- All IAM policies on `ApiFunction`
- All environment variables on `ApiFunction`

**Payload limits.** Lambda Function URLs have a 6 MB
request/response payload limit for synchronous (buffered)
invocations. This is the same effective limit as the
current API Gateway setup, since API Gateway also invokes
Lambda synchronously with the same 6 MB Lambda payload
constraint. No practical difference for BOA workloads.

### Config Changes

`.boa/config.json` adds an `extensions` array and the
`apiUrl` points to the Function URL:

```json
{
  "stackName": "my-app",
  "region": "us-east-1",
  "accountId": "123456789012",
  "apiUrl": "https://abc123.lambda-url.us-east-1.on.aws/",
  "anonKey": "eyJhbGciOiJIUzI1NiIs...",
  "serviceRoleKey": "eyJhbGciOiJIUzI1NiIs...",
  "userPoolId": "us-east-1_xxxxx",
  "userPoolClientId": "xxxxxxxxx",
  "bucketName": "my-app-storage-123456",
  "dsqlEndpoint": "xxx.dsql.us-east-1.on.aws",
  "deployedAt": "2026-04-13T12:00:00Z",
  "extensions": []
}
```

After `boa extend api-gateway`:

```json
{
  "apiUrl": "https://xxx.execute-api.us-east-1.amazonaws.com/prod",
  "extensions": ["api-gateway"],
  "functionUrl": "https://abc123.lambda-url.us-east-1.on.aws/"
}
```

The `functionUrl` field is added when the API Gateway
extension is enabled so that `boa remove api-gateway` can
revert `apiUrl` to the Function URL without querying
CloudFormation. When no extensions override the API URL,
`functionUrl` is not present (it equals `apiUrl`).

### CloudFormation Output Extraction

The `init` and `deploy` commands extract the Function URL
from CloudFormation outputs. The output key changes from
`ApiUrl` to `ApiFunctionUrl`.

In `lib/constants.mjs`, the `getOutputValue` call changes:

```javascript
// Before
const apiUrl = getOutputValue(outputs, 'ApiUrl');

// After
const apiUrl = getOutputValue(outputs, 'ApiFunctionUrl');
```

When the api-gateway extension is enabled, the deploy
command extracts both `ApiFunctionUrl` and `ApiUrl` (the
API Gateway URL added by the extension) and writes both
to config.

### Extension Architecture

#### Template Fragment Approach

Extensions are stored as SAM template fragments in the
CLI package under `cli/extensions/<name>/`. Each fragment
is a partial YAML file containing only the `Resources`
and `Outputs` to add.

The `boa extend` command reads the base template and the
extension fragment, merges the fragment's resources and
outputs into the base template, and writes the result to
a project-local template at `.boa/template.yaml`.

The `boa deploy` command uses `.boa/template.yaml` if it
exists, otherwise uses the CLI's bundled default template.
This means:

- Default (no extensions): deploys the bundled template
  with Function URLs.
- With extensions: deploys the merged template from
  `.boa/template.yaml`.

The `boa remove` command regenerates `.boa/template.yaml`
from the base template plus any remaining extensions. If
no extensions remain, it deletes `.boa/template.yaml` so
the next deploy uses the bundled default.

#### Template Merging Logic

```javascript
// lib/extensions.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml'; // dev dependency or inline

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSIONS_DIR = join(__dirname, '..', 'extensions');
const BASE_TEMPLATE = join(__dirname, '..', 'templates', 'backend.yaml');

export function getRegistry() {
  return {
    'api-gateway': {
      description: 'API Gateway REST with rate limiting, WAF, usage plans',
      fragmentPath: join(EXTENSIONS_DIR, 'api-gateway', 'fragment.yaml'),
    },
  };
}

export function mergeTemplate(enabledExtensions) {
  const base = parse(readFileSync(BASE_TEMPLATE, 'utf8'));
  for (const name of enabledExtensions) {
    const ext = getRegistry()[name];
    const fragment = parse(readFileSync(ext.fragmentPath, 'utf8'));
    Object.assign(base.Resources, fragment.Resources || {});
    Object.assign(base.Outputs, fragment.Outputs || {});
  }
  return stringify(base);
}
```

**Note on YAML parsing:** The CLI currently has zero npm
dependencies. Adding a YAML parser (`yaml` package) is
one option. An alternative is to use SAM's YAML format
and concatenate template fragments using string
manipulation (append resources section). The YAML parser
approach is cleaner and less error-prone. The `yaml`
package is 45 KB, MIT licensed, zero transitive
dependencies. This is the recommended approach.

**CloudFormation YAML tags.** SAM templates use custom
YAML tags (`!Sub`, `!Ref`, `!GetAtt`, `!If`, etc.) that
are not standard YAML. The `yaml` package (v2+) preserves
unknown tags during parse/stringify by default, so these
intrinsic functions survive the merge round-trip. This
must be verified during implementation — if any tags are
dropped or mangled, the merged template will fail to
deploy.

Alternatively, the extension fragments could be JSON
(CloudFormation accepts JSON), which Node.js parses
natively with `JSON.parse()`. This avoids adding a YAML
dependency but makes the fragments harder to read and
maintain. The trade-off favors YAML readability given
that developers may want to inspect and customize
extension templates.

#### Template Resolution in `boa deploy`

The deploy command's template resolution logic changes:

```javascript
// In commands/deploy.mjs
function resolveTemplate() {
  if (process.env.BOA_TEMPLATE_OVERRIDE) {
    return process.env.BOA_TEMPLATE_OVERRIDE;
  }
  const merged = join(process.cwd(), '.boa', 'template.yaml');
  if (existsSync(merged)) return merged;
  return join(__dirname, '..', 'templates', 'backend.yaml');
}
```

The `boa init` command always uses the bundled default
template (no extensions at init time). Extensions are
added after the first deploy.

### API Gateway Extension Fragment

`cli/extensions/api-gateway/fragment.yaml`:

```yaml
Resources:
  Api:
    Type: AWS::Serverless::Api
    Properties:
      Name: !Sub '${ProjectName}-api'
      StageName: prod
      Cors:
        AllowMethods: "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
        AllowHeaders: "'Content-Type,Authorization,apikey,Prefer,Accept,x-client-info,X-Client-Info,X-Supabase-Api-Version,content-profile,accept-profile'"
        AllowOrigin: "'*'"
        MaxAge: "'600'"
      GatewayResponses:
        DEFAULT_4XX:
          ResponseParameters:
            Headers:
              Access-Control-Allow-Origin: "'*'"
              Access-Control-Allow-Headers: "'Content-Type,Authorization,apikey,Prefer,Accept,x-client-info,X-Client-Info,X-Supabase-Api-Version,content-profile,accept-profile'"
        DEFAULT_5XX:
          ResponseParameters:
            Headers:
              Access-Control-Allow-Origin: "'*'"
              Access-Control-Allow-Headers: "'Content-Type,Authorization,apikey,Prefer,Accept,x-client-info,X-Client-Info,X-Supabase-Api-Version,content-profile,accept-profile'"

Outputs:
  ApiGatewayUrl:
    Description: API Gateway endpoint URL
    Value: !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod'
```

The fragment contains only the `Api` resource and its
output. It does **not** contain `Events` on `ApiFunction`
because SAM requires events to be defined on the function
resource itself — a separate resource cannot inject events
into an existing function.

**Important: No custom Lambda authorizer.** The API Gateway
extension uses a simple pass-through proxy — no `Auth`
section, no `BoaAuthorizer`. API Gateway forwards all
requests (including unauthenticated ones) to the
`ApiFunction` Lambda, which handles JWT validation
internally via pgrest-lambda. This is simpler and cheaper
than the current design (no separate authorizer Lambda
invocations at $0.20/M).

**Event format with API Gateway pass-through.** When API
Gateway proxies to the Lambda function, the event is v1.0
format with `event.requestContext.authorizer` absent (no
gateway-level authorizer). pgrest-lambda already handles
this case — it reads the JWT from the `Authorization`
header directly when no authorizer context is present.

**SAM template merging limitation.** SAM does not natively
support adding `Events` to an existing function resource
from a separate resource definition. The fragment cannot
independently add API events to `ApiFunction`. The
implementation must handle this by directly modifying the
`ApiFunction` resource in the merged template — inserting
the `Events` block. The `mergeTemplate()` function must
have extension-specific hooks:

```javascript
// After merging resources, apply extension-specific transforms
if (enabledExtensions.includes('api-gateway')) {
  base.Resources.ApiFunction.Properties.Events = {
    ProxyRoot: {
      Type: 'Api',
      Properties: {
        RestApiId: { Ref: 'Api' },
        Path: '/',
        Method: 'ANY',
      },
    },
    ProxyPlus: {
      Type: 'Api',
      Properties: {
        RestApiId: { Ref: 'Api' },
        Path: '/{proxy+}',
        Method: 'ANY',
      },
    },
  };
}
```

The fragment YAML file contains the `Api` resource and
`GatewayResponses`. The `Events` injection is handled in
code because SAM's resource model requires events to be on
the function itself.

### CLI Command Implementation

#### `commands/extend.mjs`

```javascript
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { getOutputValue } from '../lib/constants.mjs';
import { getRegistry, mergeTemplate } from '../lib/extensions.mjs';
import deploy from './deploy.mjs';

export default async function extend(args) {
  const name = args[0];

  if (!name) {
    console.error('Usage: boa extend <name>');
    console.error("Run 'boa extensions' to see available extensions.");
    process.exit(1);
  }

  const cfg = config.requireConfig();
  const registry = getRegistry();

  if (!registry[name]) {
    console.error(
      `Error: Unknown extension '${name}'. Run 'boa extensions' to see available extensions.`
    );
    process.exit(1);
  }

  const extensions = cfg.extensions || [];
  if (extensions.includes(name)) {
    console.error(
      `Error: Extension '${name}' is already enabled.`
    );
    process.exit(1);
  }

  console.log(`Adding extension '${name}'...`);
  console.log('');

  // Merge template
  const newExtensions = [...extensions, name];
  const merged = mergeTemplate(newExtensions);
  mkdirSync('.boa', { recursive: true });
  writeFileSync(join('.boa', 'template.yaml'), merged);

  // Deploy
  await deploy([]);

  // Update config
  const updatedCfg = config.read();
  updatedCfg.extensions = newExtensions;

  // Save the Function URL before overwriting apiUrl
  if (!updatedCfg.functionUrl) {
    updatedCfg.functionUrl = updatedCfg.apiUrl;
  }

  // Extension-specific config updates
  if (name === 'api-gateway') {
    const outputs = aws.cfnDescribeStacks(
      updatedCfg.stackName, updatedCfg.region
    );
    const gatewayUrl = getOutputValue(outputs, 'ApiGatewayUrl');
    if (gatewayUrl) {
      updatedCfg.apiUrl = gatewayUrl;
    }
  }

  config.write(updatedCfg);

  console.log('');
  console.log(`Extension '${name}' enabled.`);
  console.log(`API URL: ${updatedCfg.apiUrl}`);
}
```

#### `commands/remove.mjs`

```javascript
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import * as config from '../lib/config.mjs';
import { mergeTemplate } from '../lib/extensions.mjs';
import deploy from './deploy.mjs';

export default async function remove(args) {
  const name = args[0];

  if (!name) {
    console.error('Usage: boa remove <name>');
    process.exit(1);
  }

  const cfg = config.requireConfig();
  const extensions = cfg.extensions || [];

  if (!extensions.includes(name)) {
    console.error(
      `Error: Extension '${name}' is not enabled.`
    );
    process.exit(1);
  }

  console.log(`Removing extension '${name}'...`);
  console.log('');

  // Rebuild template without this extension
  const newExtensions = extensions.filter(e => e !== name);
  if (newExtensions.length > 0) {
    const merged = mergeTemplate(newExtensions);
    writeFileSync(join('.boa', 'template.yaml'), merged);
  } else {
    // No extensions — remove merged template, revert to default
    const mergedPath = join('.boa', 'template.yaml');
    if (existsSync(mergedPath)) unlinkSync(mergedPath);
  }

  // Deploy
  await deploy([]);

  // Update config
  const updatedCfg = config.read();
  updatedCfg.extensions = newExtensions;

  // Revert apiUrl to Function URL
  if (name === 'api-gateway' && updatedCfg.functionUrl) {
    updatedCfg.apiUrl = updatedCfg.functionUrl;
    delete updatedCfg.functionUrl;
  }

  config.write(updatedCfg);

  console.log('');
  console.log(`Extension '${name}' removed.`);
  console.log(`API URL: ${updatedCfg.apiUrl}`);
}
```

#### `commands/extensions.mjs` (list command)

```javascript
import * as config from '../lib/config.mjs';
import { getRegistry } from '../lib/extensions.mjs';

export default async function extensions(_args) {
  const cfg = config.read(); // may be null
  const registry = getRegistry();
  const enabled = cfg?.extensions || [];

  console.log('Available extensions:');
  console.log('');

  for (const [name, info] of Object.entries(registry)) {
    const status = enabled.includes(name) ? '  [enabled]' : '';
    console.log(`  ${name.padEnd(18)} ${info.description}${status}`);
  }

  console.log('');
  if (enabled.length > 0) {
    console.log(`Enabled: ${enabled.join(', ')}`);
  } else {
    console.log('Enabled: (none)');
  }
}
```

### Entry Point Update

`bin/boa.mjs` adds the three new commands to the command
list and help text:

```javascript
const COMMANDS = [
  'init', 'deploy', 'migrate', 'verify',
  'teardown', 'status', 'check', 'feedback',
  'extend', 'remove', 'extensions',
];
```

### `boa verify` Update

In `commands/verify.mjs`, the "Checking API Gateway..."
label changes to "Checking API endpoint...". The logic
is identical — curl the `apiUrl` from config and check
the HTTP status code. No other changes.

### `boa status` Update

In `commands/status.mjs`, add a line showing enabled
extensions:

```javascript
const extensions = cfg.extensions || [];
console.log(
  `  Extensions:  ${extensions.length > 0 ? extensions.join(', ') : '(none)'}`
);
```

### `boa teardown` Update

Teardown removes the `.boa/template.yaml` merged template
along with the rest of `.boa/`. No additional cleanup
needed since CloudFormation handles resource deletion.

### DSQL Region Availability

Lambda Function URLs are supported in `us-east-1` and
`us-east-2` (the DSQL regions BOA supports). No region
restrictions are introduced by this change.

### CORS Behavior with Function URLs

Lambda Function URLs handle CORS at the infrastructure
level for preflight (OPTIONS) requests. For non-preflight
requests, the Function URL includes configured CORS
headers **in addition to** any CORS headers returned by
the Lambda function. pgrest-lambda already returns CORS
headers in its responses. This means non-preflight
responses will have duplicate CORS headers.

**Resolution:** pgrest-lambda should detect when it is
running behind a Function URL (by checking
`event.version === '2.0'`) and skip adding its own CORS
headers, letting the Function URL configuration handle
CORS. This is a pgrest-lambda package change, not a
handler code change.

Alternatively, duplicate CORS headers are generally
harmless — browsers accept them. But for cleanliness,
pgrest-lambda should avoid the duplication.

## Code Architecture / File Changes

### New Files

| File | Purpose |
|------|---------|
| `cli/commands/extend.mjs` | `boa extend <name>` command |
| `cli/commands/remove.mjs` | `boa remove <name>` command |
| `cli/commands/extensions.mjs` | `boa extensions` list command |
| `cli/lib/extensions.mjs` | Extension registry, template merging |
| `cli/extensions/api-gateway/fragment.yaml` | API Gateway SAM resources |
| `cli/extensions/api-gateway/README.md` | Extension documentation |

### Modified Files

| File | Change |
|------|--------|
| `cli/templates/backend.yaml` | Remove API Gateway resources, add FunctionUrlConfig, change output to ApiFunctionUrl |
| `plugin/templates/backend.yaml` | Same changes as CLI template (kept in sync) |
| `cli/bin/boa.mjs` | Add `extend`, `remove`, `extensions` to command list and help |
| `cli/commands/init.mjs` | Extract `ApiFunctionUrl` output instead of `ApiUrl`; write `extensions: []` to config |
| `cli/commands/deploy.mjs` | Use `resolveTemplate()` for template path; extract `ApiFunctionUrl` output |
| `cli/commands/verify.mjs` | Change "API Gateway" label to "API endpoint" |
| `cli/commands/status.mjs` | Add extensions line to output |
| `cli/lib/constants.mjs` | No change needed (getOutputValue is generic) |
| `cli/package.json` | Add `yaml` dependency if YAML merging approach is used; add `extensions/` to `files` array |

### pgrest-lambda Changes (Separate Package)

| Change | Purpose |
|--------|---------|
| Export `normalizeEvent()` utility | Normalize v2.0 events to v1.0 shape |
| Detect event version in `handler()` | Auto-normalize internally |
| Skip CORS headers when `event.version === '2.0'` | Avoid duplicate CORS with Function URL config |

These are pgrest-lambda npm package changes, shipped as a
version bump. The handler files in `cli/templates/lambda/`
need a minor update to call `normalizeEvent()` — see
Technical Design section above.

### Handler File Changes

`cli/templates/lambda/index.mjs` — one line added:

```javascript
import { createPgrest } from 'pgrest-lambda';
import { handler as uploadHandler } from './presigned-upload.mjs';

const pgrest = createPgrest();

export async function handler(rawEvent) {
  const event = pgrest.normalizeEvent(rawEvent);  // NEW
  const path = event.path || '';
  if (path === '/upload' || path === '/download') {
    return uploadHandler(event);
  }
  return pgrest.handler(event);
}
```

`authorizer.mjs` and `presigned-upload.mjs` — no changes.
The authorizer is only invoked by API Gateway (v1.0
events). The presigned upload handler receives the
already-normalized event from `index.mjs`.

## Testing Strategy

### Manual Integration Test Plan

#### Phase A: Default Backend with Function URLs

1. **`boa init test-furl --region us-east-1`** — Creates
   project and deploys. `.boa/config.json` has `apiUrl`
   matching `lambda-url.*.on.aws` pattern. `extensions`
   array is empty. No API Gateway resources in the stack.

2. **Auth through Function URL** — Sign up and sign in
   using `@supabase/supabase-js` against the Function URL.
   Verify tokens are issued, refresh works.

3. **REST CRUD through Function URL** — Create, read,
   update, delete rows via PostgREST endpoints. Verify
   all operations return correct data.

4. **CORS through Function URL** — From a browser on
   `localhost`, make a fetch request. Verify preflight
   OPTIONS returns correct CORS headers and the actual
   request succeeds.
   ⚠ CORS headers on non-preflight responses could come
   from either the Function URL CORS config or from
   pgrest-lambda's response headers. Verify that
   preflight OPTIONS (which is handled by Function URL
   infrastructure, not the Lambda function) returns
   correct headers — this confirms the Function URL
   CORS config is working.

5. **`boa verify`** — All checks pass. "Checking API
   endpoint..." shows PASS for 401.

6. **`boa status`** — Shows Function URL as API URL.
   Extensions line shows "(none)".

#### Phase B: API Gateway Extension

7. **`boa extend api-gateway`** — Deploys API Gateway.
   `.boa/config.json` `apiUrl` changes to API Gateway URL.
   `extensions` contains `["api-gateway"]`.
   `functionUrl` field is set to the Function URL.

8. **Auth through API Gateway** — Same signup/signin test,
   through the API Gateway URL.

9. **REST CRUD through API Gateway** — Same CRUD test,
   through the API Gateway URL.

10. **CORS through API Gateway** — Preflight and actual
    requests work.

11. **`boa verify`** — All checks pass with API Gateway
    URL.

12. **`boa status`** — Shows API Gateway URL. Extensions
    shows "api-gateway".

#### Phase C: Extension Removal

13. **`boa remove api-gateway`** — Deploys without API
    Gateway. `apiUrl` reverts to Function URL.
    `extensions` is empty. `functionUrl` field is removed.

14. **Auth and REST still work** — Through the Function URL.

15. **`boa verify`** — All checks pass with Function URL.

#### Phase D: CLI Validation

16. **`boa extend unknown`** — Error:
    `Unknown extension 'unknown'`.

17. **`boa extend api-gateway` twice** — First succeeds,
    second errors: `already enabled`.

18. **`boa remove api-gateway` when not enabled** — Error:
    `not enabled`.

19. **`boa extensions`** — Lists api-gateway with correct
    enabled/disabled status.

20. **`boa extend` with no argument** — Shows usage.

#### Phase E: Migration Path

21. **Existing API Gateway project** — Deploy with old CLI
    (API Gateway default), then upgrade CLI and run
    `boa deploy`. Verify warning is shown, API URL
    changes to Function URL, app still works.

22. **Config compatibility** — Read a config written by the
    old CLI (no `extensions` field). Verify all commands
    handle the missing field gracefully (`extensions`
    defaults to `[]`).

### Unit-Testable Logic

**lib/extensions.mjs:**
- `getRegistry()` returns object with `api-gateway` entry.
- `mergeTemplate([])` returns the base template unchanged.
- `mergeTemplate(['api-gateway'])` returns template with
  `Api` resource and `ApiFunction.Events` added.
- `mergeTemplate(['unknown'])` throws an error.

**Template resolution:**
- `resolveTemplate()` returns `.boa/template.yaml` when it
  exists.
- `resolveTemplate()` returns bundled default when
  `.boa/template.yaml` does not exist.

**Config backwards compatibility:**
- `config.read()` on a config without `extensions` field
  returns the config as-is (no error).
- Commands that read `cfg.extensions || []` default to
  empty array.

## Implementation Order

### Phase 1: pgrest-lambda Update

1. Add `normalizeEvent()` export to pgrest-lambda that
   converts v2.0 events to v1.0 shape.
2. Update `pgrest.handler()` to auto-normalize internally.
3. Add CORS skip logic for v2.0 events.
4. Publish new pgrest-lambda version.
5. Update `cli/templates/lambda/package.json` to use new
   pgrest-lambda version.

### Phase 2: Default Template Update

6. Update `cli/templates/backend.yaml` — remove API Gateway
   resources, add `FunctionUrlConfig`, change outputs.
7. Update `plugin/templates/backend.yaml` — same changes.
8. Update `cli/templates/lambda/index.mjs` — add
   `normalizeEvent()` call.
9. Update `cli/commands/init.mjs` — extract
   `ApiFunctionUrl` output, write `extensions: []`.
10. Update `cli/commands/deploy.mjs` — add template
    resolution logic, extract `ApiFunctionUrl`.
11. Update `cli/commands/verify.mjs` — change label.
12. Update `cli/commands/status.mjs` — add extensions line.

### Phase 3: Extension System

13. Create `cli/lib/extensions.mjs` — registry and template
    merging.
14. Create `cli/extensions/api-gateway/fragment.yaml`.
15. Create `cli/extensions/api-gateway/README.md`.
16. Implement `cli/commands/extend.mjs`.
17. Implement `cli/commands/remove.mjs`.
18. Implement `cli/commands/extensions.mjs`.
19. Update `cli/bin/boa.mjs` — add new commands.
20. Update `cli/package.json` — add `yaml` dependency
    (if used), add `extensions/` to files.

### Phase 4: Migration Path

21. Add API URL change warning in `deploy.mjs` for
    existing API Gateway projects.
22. Ensure backwards compatibility with configs missing
    the `extensions` field.

### Phase 5: End-to-End Validation

23. Run the full manual test plan (Phases A–E above).
24. Update the BOA skill docs to document extensions.

## Open Questions

1. **YAML parser dependency.** The CLI currently has zero
   npm dependencies. Adding `yaml` for template merging
   adds one dependency (45 KB, zero transitive deps).
   Alternatively, extension fragments could be JSON. The
   trade-off is readability vs. dependency count. Both
   approaches work.

2. **pgrest-lambda normalizeEvent scope.** Should
   `normalizeEvent()` be called in `index.mjs` (handler
   file change) or should `pgrest.handler()` normalize
   internally and also export the normalized event for
   pre-handler routing? The former is simpler (one line
   change), the latter is more encapsulated but requires
   a different API surface.

3. **Duplicate CORS headers.** Lambda Function URLs add
   CORS headers to non-preflight responses alongside any
   headers the function returns. Should pgrest-lambda
   suppress its CORS headers when running behind Function
   URLs, or accept the duplication? Browsers handle
   duplicate CORS headers gracefully, but it is messy.

4. **Extension template format.** Should extension
   fragments be YAML (readable, requires parser) or JSON
   (native parsing, less readable)? Or should extensions
   be implemented as pure code that programmatically
   constructs CloudFormation resources?

5. **Existing project migration opt-in.** When a developer
   upgrades the CLI and runs `boa deploy`, should the
   switch from API Gateway to Function URLs happen
   automatically (with a warning), or should it require an
   explicit `boa migrate-to-furl` command? Automatic is
   simpler but riskier for production deployments.

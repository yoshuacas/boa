# Plan: API Gateway Default, ALB Extension

## Problem

BOA defaults to ALB + WAF as the traffic layer. ALB has no
HTTPS listener (ACM cert and domain required), so the
generated `apiUrl` is `http://<alb-dns>`. That single fact
is the dominant source of "my app doesn't work" reports:

- Chrome's HTTPS-First (default since Chrome 117) silently
  rewrites `http://` subresource requests to `https://`.
  The ALB has no TLS listener, the upgraded request resets,
  and the browser reports `TypeError: Failed to fetch` with
  no CORS error in the console.
- Any frontend served over HTTPS (Amplify, Vercel,
  `claude.ai/code` previews) blocks the HTTP API as mixed
  content.

The `api-gateway` extension already replaces ALB with API
Gateway REST and ships over HTTPS on the AWS-managed
`*.execute-api.<region>.amazonaws.com` endpoint. The
infrastructure to flip the default is in place; only the
product default and the surrounding text need to change.

Inverting the default means:

- `boa init` produces an HTTPS `apiUrl` out of the box. No
  ACM cert, no domain, no CloudFront, no dev proxy.
- ALB becomes an optional extension for long-request,
  streaming, or high-throughput workloads that outgrow API
  Gateway's 30 s / 10 MB limits.

## Goals

1. `boa init` deploys API Gateway REST as the default
   traffic layer. Generated `apiUrl` is HTTPS.
2. Add an `alb` extension that reinstates ALB + VPC + WAF
   + the associated outputs for projects that opt in.
3. WAF continues to ship by default. API Gateway REST
   supports `WAFv2::WebACLAssociation` against the stage
   ARN; rate-limit and IP-reputation rules move with it.
4. `@supabase/supabase-js` and `@boa-cloud/client` keep
   working unchanged — the change is transport only.
5. Existing ALB-backed projects keep working. `boa deploy`
   on an old project does not silently swap the traffic
   layer.
6. Docs, pricing, skill, and PITFALLS reflect the new
   default consistently.

## Non-Goals

- Do not add a custom-domain flow. That stays a future
  extension.
- Do not migrate ALB-backed projects automatically. An
  explicit `boa migrate traffic api-gateway` (or a
  teardown-and-reinit) comes later.
- Do not remove the ALB code path. It becomes an
  extension, not dead code.
- Do not change the `pgrest-lambda` handler contract. It
  already handles both ALB and API Gateway REST event
  shapes (the current extension proves this).

## Proposed CX

### New Projects

`boa init` prints a concise traffic-layer summary:

```text
API Gateway REST + WAF (HTTPS, rate limiting)
```

`.boa/config.json` is smaller — no `alb` block:

```json
{
  "apiUrl": "https://abc123.execute-api.us-east-1.amazonaws.com/prod",
  "apiGateway": {
    "restApiId": "abc123",
    "stage": "prod"
  },
  "authProvider": "better-auth",
  "pgrestLambdaVersion": "x.y.z",
  "extensions": []
}
```

### Adding ALB

```bash
boa extend alb
boa deploy
```

Prints:

```text
ALB extension enabled.
  - Creates VPC, public subnets, ALB, HTTP listener
  - Moves WAF association from API Gateway stage to ALB
  - apiUrl remains the API Gateway URL unless you remove
    api-gateway
```

(See "ALB + API Gateway simultaneously" below for the
policy on coexistence.)

### Existing ALB Projects

`.boa/config.json` with an `alb` block continues to work.
On `boa deploy`, the CLI detects it and keeps the ALB
template path:

```text
This project uses ALB as the traffic layer (legacy default).
Keeping ALB — to move to API Gateway, tear down and re-run
boa init, or wait for `boa migrate traffic api-gateway`.
```

No silent swap. The existing deploy-migration safety
checks in `cli/commands/deploy.mjs:15–30` stay; we add the
inverse check so a legacy ALB project is not forced onto
API Gateway.

## Technical Design

### Base Template

Move API Gateway REST into `cli/templates/backend.yaml`:

- Add `AWS::Serverless::Api` (Name, StageName: prod, CORS,
  gateway responses) — the body of the current
  `cli/extensions/api-gateway/fragment.yaml`.
- Add API events on `ApiFunction` (`ProxyRoot /` and
  `ProxyPlus /{proxy+}`).
- Replace ALB env-var references:
  - `BETTER_AUTH_URL: !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod'`
  - `API_BASE_URL:    !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod/rest/v1'`
- Remove VPC, subnets, internet gateway, route table, ALB
  security group, ALB, ALB listener, target group, ALB
  Lambda permission.
- Add WAFv2 WebACL (scope `REGIONAL`, same rate-limit and
  IP-reputation rules) and a `WAFv2::WebACLAssociation`
  whose `ResourceArn` is
  `arn:aws:apigateway:${AWS::Region}::/restapis/${Api}/stages/prod`.
- Remove `ReservedConcurrentExecutions` (API Gateway has
  its own throttling).
- Outputs: `ApiGatewayUrl`, `RestApiId`, `BucketName`,
  `DsqlEndpoint`. Drop `AlbUrl`, `AlbArn`,
  `TargetGroupArn`, `VpcId`.

Update `Description:` to
`BOA — Backend on AWS serverless stack (API Gateway, WAF, Aurora DSQL, Lambda, S3)`.

### ALB Extension

Create `cli/extensions/alb/fragment.yaml` containing every
resource the current base template has and the API Gateway
default lacks:

- VPC + 2 public subnets + IGW + route table + subnet
  associations.
- `AlbSecurityGroup`, `ApplicationLoadBalancer`,
  `AlbLambdaPermission`, `AlbTargetGroup`,
  `AlbHttpListener`.
- `WafAlbAssociation` (reuses the `WafWebAcl` in the base
  — see "WAF" below).
- Restore `ReservedConcurrentExecutions: 50` on
  `ApiFunction`.
- Outputs: `AlbUrl`, `AlbArn`, `TargetGroupArn`, `VpcId`.

Register it in `cli/lib/extensions.mjs:10`:

```js
'alb': {
  description: 'Add ALB + VPC + HTTP listener for long requests or streaming',
  fragmentPath: join(EXTENSIONS_DIR, 'alb', 'fragment.yaml'),
},
```

### WAF

API Gateway REST supports WAFv2 `REGIONAL` WebACLs
associated with the stage ARN. Keep the existing
`WafWebAcl` resource in the base template and create the
API Gateway association there. When the `alb` extension
is applied, add a second association for the ALB — or
switch the association based on extension presence. Pick
"switch" (one association at a time) to match the current
one-traffic-layer assumption; document it clearly.

### ALB + API Gateway Simultaneously

Disallow. The policy:

- Default: API Gateway only.
- `boa extend alb`: remove API Gateway from the merged
  template, install ALB. Mirror of the current
  `boa extend api-gateway` transform (which removes ALB).
- `boa remove alb`: revert to the base (API Gateway).

This keeps the skill mental model simple: one traffic
layer. The `cli/lib/extensions.mjs` transform for `alb`
becomes the symmetric inverse of the current `api-gateway`
transform: it deletes `Api`, removes `Events` from
`ApiFunction`, flips `BETTER_AUTH_URL` /
`API_BASE_URL` to the ALB DNS, and restores the reserved
concurrency.

### Deprecate `api-gateway` Extension

Keep the extension name in the registry but point it at
an empty fragment with a warning:

```text
api-gateway is now the default. No action required.
Run `boa remove alb` if you're switching away from ALB.
```

Drop it entirely in the release after launch.

### Config Shape

`.boa/config.json`:

- Remove `alb` block from the default init path.
- Add `apiGateway: { restApiId, stage }` to the default
  init path.
- `apiUrl` is the API Gateway stage URL by default.
- When the `alb` extension is enabled, the config gains an
  `alb` block and `apiUrl` becomes the ALB DNS.

No migration required for existing configs — the fields
are additive and CLI code reads them conditionally.

### CLI Changes

| File | Change |
|------|--------|
| `cli/templates/backend.yaml` | Replace ALB + VPC with API Gateway + WAF stage association. |
| `cli/extensions/alb/` | New — fragment + README, mirroring the current `api-gateway` extension. |
| `cli/extensions/api-gateway/` | Deprecate; empty fragment, README explains. |
| `cli/lib/extensions.mjs` | Register `alb`; invert the transform direction; keep `api-gateway` as a no-op alias for one release. |
| `cli/commands/init.mjs` | Read `ApiGatewayUrl` / `RestApiId`, drop ALB output reads from the default path, keep them behind the extension branch. Update the "stack summary" text on line 94. |
| `cli/commands/deploy.mjs` | Keep the existing migration blockers. Add a branch: if `cfg.alb` exists, continue using the ALB template path — do not swap layers. |
| `cli/commands/verify.mjs` | Skip the ALB target-group + WAF-on-ALB checks when `cfg.alb` is absent. Add API Gateway checks: stage exists, WAF association present, `apiUrl/rest/v1/` returns a valid code. |
| `cli/commands/status.mjs` | Print `API Gateway: <url>` when no `alb` block; keep the ALB print for legacy projects. |
| `cli/commands/teardown.mjs` | Delete API Gateway stack; no VPC teardown in the default path. |

### Skill, Docs, Pitfalls

| File | Change |
|------|--------|
| `plugin/CLAUDE.md:13–18` | "API" row: `API Gateway REST + WAF (default)`. Paragraph: "API Gateway is the default traffic layer. ALB is available as an extension (`boa extend alb`) for long requests, streaming, or high-throughput workloads." |
| `plugin/skills/boa/SKILL.md:3,37,51–56,71,114` | Description, ASCII diagram, traffic-layer prose, and extensions section all swap ALB ↔ API Gateway. |
| `plugin/docs/PITFALLS.md:28,89–99` | Rewrite #25. New lead: "Failed to fetch / silent network errors on HTTP APIs." Root cause: Chrome HTTPS-First auto-upgrade. Resolution: default to API Gateway (done); only add ALB when you need >30 s timeouts, and attach an ACM cert. |
| `plugin/docs/API-PATTERNS.md`, `AUTH-PATTERNS.md`, `STORAGE-PATTERNS.md`, `REST-API.md`, `plugin/AGENTS.md`, `plugin/skills/boa-manage/SKILL.md` | Grep-and-replace ALB references in user-facing prose. Keep ALB references where they describe the extension. |
| `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/GLOSSARY.md`, `CLAUDE.md:44,53` | Canonical nomenclature update: "API" row is API Gateway, "ALB + WAF" becomes "API Gateway + WAF" in the default stack. Keep ALB in the glossary as an extension. |
| `website/install.md`, `website/.vitepress/` source docs | Same. Ignore `website/.vitepress/dist/` — regenerated on build. |
| `website/scripts/generate-pricing.mjs` | Make API Gateway the always-on cost line for `traffic: default`. Keep the ALB scenario for the `extension: alb` path. The extension labels on line 875 already have both. |

### Tests

| Test | Update |
|------|--------|
| `cli/__tests__/template-structure.test.mjs` | Assert base template has `AWS::Serverless::Api`, not `ElasticLoadBalancingV2::LoadBalancer`. |
| `cli/__tests__/extensions.test.mjs` | Add cases for the new `alb` extension: it adds LB/VPC resources, removes `Api`, flips `apiUrl` env vars. |
| `cli/__tests__/extend-command.test.mjs` | `boa extend alb` round-trip. |
| `cli/__tests__/remove-command.test.mjs` | `boa remove alb` round-trip. |
| `cli/__tests__/extensions-list-command.test.mjs` | `alb` appears in the list; `api-gateway` listed as deprecated. |
| `cli/__tests__/deploy-migration.test.mjs` | Existing ALB projects still deploy; the "ALB → API Gateway" path requires `alb` be absent and continues cleanly. |
| New eval scenario | `boa init` → frontend fetch works without a dev proxy over HTTPS (e.g., an Amplify-hosted static page). Covers the pitfall this whole plan targets. |

### pgrest-lambda Contract

The current `api-gateway` extension is in production use,
so `pgrest-lambda` already handles the API Gateway REST
event shape. No code change in the lambda wrappers.
Verify once with the existing integration fixtures before
flipping the default.

## Risks

1. **API Gateway 30 s / 10 MB limits.** Anyone hitting
   them today on ALB would regress. Mitigation: `boa
   extend alb` exists; docs call out the thresholds next
   to the pitfall rewrite.
2. **Cost at scale.** API Gateway is $3.50/M requests vs
   ALB's LCU pricing. Pricing page already computes both;
   the default scenario just changes.
3. **CloudFormation stage-ARN WAF association.** The
   `arn:aws:apigateway:${Region}::/restapis/${Api}/stages/prod`
   ARN is quirky (missing account ID, double colon).
   Validate with a test deploy before committing the base
   template.
4. **Existing ALB projects on `boa deploy`.** The
   migration guard in `cli/commands/deploy.mjs:25–30`
   currently blocks `execute-api` → ALB. We need the
   inverse: do not force legacy ALB projects onto API
   Gateway. Add an explicit branch rather than reusing
   the existing blocker.
5. **Evals / website regeneration.** Prices, architecture
   diagrams, install copy all change in lockstep. A
   single PR avoids drift.

## Rollout

1. Cut a feature branch via rring
   (`rring start api-gateway-default`).
2. Land the base template + extension + CLI changes first,
   behind the existing `BOA_TEMPLATE_OVERRIDE` so manual
   testing can compare old and new in the same account.
3. Deploy a fresh sample app on the new default; run the
   skill-creator eval harness end-to-end.
4. Update skill, docs, PITFALLS, pricing, website in the
   same PR as the CLI change.
5. Publish. The `api-gateway` extension becomes a no-op
   alias for one release, then deletes.

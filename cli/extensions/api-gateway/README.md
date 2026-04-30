# API Gateway Extension

API Gateway REST + WAF is the default traffic layer for every BOA backend. `boa extend api-gateway` is kept as a recognized name for forward compatibility but does not add anything to the stack.

To customize rate limiting, CORS, or WAF rules, edit the relevant resource in `cli/templates/backend.yaml` (or `.boa/template.yaml`) and run `boa deploy`:

- `WafWebAcl` owns the rate limit (`RateBasedStatement.Limit`) and the AWS-managed IP reputation rule.
- `ApiFunction.Environment.Variables.ALLOWED_ORIGINS` controls CORS. It is fed by the `AllowedOrigins` stack parameter, which `boa deploy` sets from `cfg.allowedOrigins` in `.boa/config.json`.

See [plugin/docs/API-PATTERNS.md](../../../plugin/docs/API-PATTERNS.md) for how requests flow through the default traffic layer.

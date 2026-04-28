# Task 06: Documentation + Skill Updates

**Agent:** implementer
**Design:** docs/design/api-gateway-default.md
**Depends on:** Task 02, Task 03

## Objective

Update all documentation and skill files to reflect API
Gateway REST + WAF as the default traffic layer and ALB
as an optional extension.

## Target Tests

No automated tests. This is a documentation-only task.

## Implementation

Update each file listed below. For each file, change
references from ALB as the default to API Gateway REST
as the default. Keep ALB mentions where they describe the
extension or legacy behavior.

### Plugin Files

1. **`plugin/CLAUDE.md`**: In the AWS Stack table, change
   the API row from `ALB + WAF` to
   `API Gateway REST + WAF (default)`. Update any
   paragraph about extensions to note ALB is available
   via `boa extend alb`.

2. **`plugin/skills/boa/SKILL.md`**: Update the
   description, ASCII architecture diagram, traffic-layer
   prose, and extensions section. API Gateway REST + WAF
   is the default. ALB is an extension for long requests,
   streaming, or high throughput.

3. **`plugin/skills/boa-manage/SKILL.md`**: Update
   references to the default traffic layer.

4. **`plugin/AGENTS.md`**: Backend architecture: API
   Gateway REST + WAF. Keep ALB as extension mention.

5. **`plugin/docs/PITFALLS.md`**: Rewrite pitfall #25
   (or whichever covers HTTP/HTTPS issues). New lead:
   "Failed to fetch / silent network errors on HTTP
   APIs." Root cause: Chrome HTTPS-First mode. Resolution:
   API Gateway is now the default and provides HTTPS out
   of the box. Only relevant if using ALB extension
   without ACM cert.

6. **`plugin/docs/API-PATTERNS.md`**: Default traffic
   layer is API Gateway REST + WAF. ALB available as
   extension.

7. **`plugin/docs/AUTH-PATTERNS.md`**: Replace ALB URL
   references in examples with API Gateway URL format
   (`https://<id>.execute-api.<region>.amazonaws.com/prod`).

8. **`plugin/docs/STORAGE-PATTERNS.md`**: Replace ALB URL
   references with API Gateway URL where describing the
   default.

9. **`plugin/docs/REST-API.md`**: Update any ALB default
   references.

### Project Docs

10. **`CLAUDE.md`** (repo root): Update the AWS Stack
    table. Change `ALB + WAF (default)` to
    `API Gateway REST + WAF (default)`. Update the text
    below the table: "ALB + WAF is the default traffic
    layer" becomes "API Gateway REST + WAF is the default
    traffic layer. ALB is available as an extension
    (`boa extend alb`)." Also update Critical Rule about
    extensions: "API Gateway is the default. ALB is
    available as an extension."

11. **`docs/ARCHITECTURE.md`**: Update system diagram and
    traffic layer section.

12. **`docs/PRODUCT.md`**: Stack table: ALB + WAF becomes
    API Gateway REST + WAF.

13. **`docs/GLOSSARY.md`**: Update extension terminology.
    ALB is extension, API Gateway is default.

### Pricing

14. **`website/scripts/generate-pricing.mjs`**: If this
    file references the default traffic layer, update
    API Gateway as always-on cost for default scenarios.
    ALB behind `extension: alb` scenario.

### Pattern for all changes

- Replace `ALB + WAF` with `API Gateway REST + WAF` when
  describing the default
- Replace `http://<alb-dns>` example URLs with
  `https://<id>.execute-api.<region>.amazonaws.com/prod`
- Keep ALB mentions in extension-related sections
- Keep ALB mentions in legacy/migration documentation
- Do not change any code logic, only prose and examples

## Acceptance Criteria

- All modified files are valid markdown
- No broken internal links
- All existing tests still pass (docs changes should not
  affect test outcomes)
- Consistent terminology: "API Gateway REST + WAF" when
  describing the default, "ALB" when describing the
  extension

## Conflict Criteria

If a file listed above does not exist, skip it and note
in the commit message which files were missing. If a file
has no ALB references to update, skip it.

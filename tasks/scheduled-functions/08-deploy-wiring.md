# Task 08: Deploy Command Schedule Wiring

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Modify `cli/commands/deploy.mjs` to generate the schedules
nested-stack template, upload it to S3, and pass the URL as
a CloudFormation parameter.

## Target Tests

No direct E2E test in Task 01 targets this (it requires
live AWS). Validation is integration-level: the deploy flow
must generate and upload the template when schedules exist,
and skip it when they do not.

## Implementation

Modify `cli/commands/deploy.mjs` (and/or the deploy lib it
calls for `packageArtifacts`):

### After functions zip upload:

1. Import `generateSchedulesTemplate` from
   `../lib/functions/schedule.mjs`.

2. After the functions zip is uploaded (around line
   156-163), call:

   ```javascript
   const schedulesTemplate =
     generateSchedulesTemplate(descriptors);
   ```

   Where `descriptors` is the array returned by
   `discover()` earlier in the deploy flow.

3. If `schedulesTemplate` is not `null`:
   - Compute a content-addressed key:
     `schedules/${hash}.yaml` (use the same hashing
     approach as the functions zip, e.g., SHA-256 of
     template content).
   - Upload the YAML to the artifacts bucket at that key.
   - Set `schedulesTemplateUrl` to the S3 URL
     (`https://<bucket>.s3.<region>.amazonaws.com/schedules/${hash}.yaml`).

4. If `schedulesTemplate` is `null`, set
   `schedulesTemplateUrl` to `''` (or omit the
   parameter).

### CloudFormation parameter passing:

In the section that builds CFN parameters (around lines
181-183), add:

```javascript
if (schedulesTemplateUrl) {
  params.FunctionsSchedulesTemplateUrl = schedulesTemplateUrl;
}
```

### Deploy output:

Update the functions summary line to include schedule
count:

```
Functions: 3 deployed (2 scheduled)
```

Count scheduled functions from descriptors where
`schedule !== null`. Only show the parenthetical when
count > 0.

### `packageArtifacts()` return shape:

If the deploy lib has a `packageArtifacts()` function
that returns artifact URLs, add `schedulesTemplateUrl` to
its return value:

```javascript
return {
  bucket, lambdaKey, functionsKey,
  schedulesTemplateUrl, templateUrl, accountId
};
```

**Depends on:** Task 04 (generateSchedulesTemplate exists),
Task 07 (backend.yaml accepts the parameter)

## Acceptance Criteria

- When functions with schedules exist, deploy generates a
  YAML template and uploads it to S3
- The `FunctionsSchedulesTemplateUrl` parameter is passed
  to CloudFormation with the S3 URL
- When no functions have schedules, the parameter is
  omitted (or empty string)
- Deploy output shows schedule count
- Existing deploys without scheduled functions continue to
  work unchanged
- No new dependencies added

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If the deploy flow does not call `discover()` directly
  (descriptors come from another path), trace the data
  flow and ensure schedule fields are available at the
  point where template generation is needed. Adjust the
  approach accordingly.

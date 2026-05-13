# Task 05: Amplify API Wrapper

**Agent:** implementer
**Design:** docs/design/frontend-deploy.md

## Objective

Implement `cli/lib/amplify.mjs` wrapping the AWS Amplify CLI
commands for creating apps, branches, deploying zip artifacts,
attaching custom domains, and deleting apps.

## Target Tests

From `cli/__tests__/frontend-amplify.test.mjs`:
- createApp command construction and response parsing
- createBranch command construction
- startDeployment (create-deployment + upload + start-deployment
  sequence)
- deleteApp command construction
- attachDomain command construction

## Implementation

### cli/lib/amplify.mjs

Follow the pattern in `cli/lib/aws.mjs` for subprocess
execution (uses `child_process.execSync` or the project's
`exec` helper with JSON output parsing).

**`createApp({ name, region })`:**
```javascript
aws amplify create-app --name <name> --region <region> --output json
```
Parse the response and return `{ appId: app.appId, defaultDomain: app.defaultDomain }`.

**`createBranch({ appId, branch, region })`:**
```javascript
aws amplify create-branch --app-id <appId> --branch-name <branch> --region <region>
```
Branch defaults to `'main'` if not provided.

**`startDeployment({ appId, branch, zipPath, region })`:**

This is a three-step process:
1. Create the deployment to get an upload URL:
   ```javascript
   aws amplify create-deployment --app-id <appId> --branch-name <branch> --region <region>
   ```
   Response contains `{ jobId, zipUploadUrl }`.

2. Upload the zip to the presigned URL:
   Use `curl` or Node's `https` module to PUT the zip file to
   `zipUploadUrl` with `Content-Type: application/zip`.

3. Start the deployment:
   ```javascript
   aws amplify start-deployment --app-id <appId> --branch-name <branch> --job-id <jobId> --region <region>
   ```

Return `{ jobId, appId }`.

**`waitForDeployment({ appId, branch, jobId, region })`:**

Poll `aws amplify get-job --app-id <appId> --branch-name <branch> --job-id <jobId>`
until status is `SUCCEED` or `FAILED`. Use 5-second intervals,
max 120 seconds timeout. Follow the polling pattern from
`cli/lib/deploy.mjs` `waitForTerminalStatus`.

Return `{ status, endTime }`.

**`deleteApp({ appId, region })`:**
```javascript
aws amplify delete-app --app-id <appId> --region <region>
```

**`attachDomain({ appId, domain, branch, region })`:**
```javascript
aws amplify create-domain-association --app-id <appId> --domain-name <domain> --sub-domain-settings prefix=,branchName=<branch> --region <region>
```
Return the DNS validation records from the response for the
developer to add to their registrar.

**`getApp({ appId, region })`:**

Utility to check if an app exists:
```javascript
aws amplify get-app --app-id <appId> --region <region>
```
Return the app object or `null` if not found.

### Error handling

- If any AWS CLI command fails, throw with the stderr message.
- If the app already exists (for createApp), detect the
  `BadRequestException` and provide a clear message.
- If `waitForDeployment` times out, throw
  "Deployment timed out after 120 seconds".

### Notes

- All commands include `--output json` for machine-parseable
  output.
- The zip upload uses a presigned S3 URL -- no AWS credentials
  are needed for the PUT itself, just the URL from
  create-deployment.
- The region parameter is required on every call (matching the
  pattern in `cli/lib/aws.mjs` where region is explicit).

## Acceptance Criteria

- All `frontend-amplify.test.mjs` tests pass.
- Existing tests still pass.
- Error messages from AWS CLI failures are propagated clearly.
- The module exports all 7 functions: `createApp`,
  `createBranch`, `startDeployment`, `waitForDeployment`,
  `deleteApp`, `attachDomain`, `getApp`.

## Conflict Criteria

- If all target tests already pass before any code changes are
  made, investigate whether the tests are true positives before
  marking the task complete.
- If the AWS Amplify CLI command syntax differs from what is
  documented here (e.g., different flag names), use the actual
  CLI syntax from `aws amplify help` and adjust tests
  accordingly rather than escalating.

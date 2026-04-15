# Task 06: Integration Test Pass

**Agent:** implementer
**Design:** docs/design/boa-client-library.md
**Depends on:** Task 02, Task 03, Task 04, Task 05

## Objective

Run the integration tests against the live boa-cars-test
backend and fix any issues discovered in the client library.

## Target Tests

From `client/tests/integration.test.ts` (all tests):
- Auth flow: signUp, getUser, signOut, signIn roundtrip.
- Token refresh: simulated expiry triggers 401 retry.
- Data CRUD: insert, select, update, delete on cars table.
- Filters and ordering: order, eq, gt, in filters.
- Count: select with `{ count: 'exact' }`.
- Storage: createUploadUrl, upload, createDownloadUrl,
  download (if endpoints are deployed).
- Error handling: nonexistent table, wrong password.

## Implementation

### Enable and run integration tests

Set `BOA_INTEGRATION=1` (or equivalent env var from
Task 01's skip condition) and run:

```bash
cd client
BOA_INTEGRATION=1 node --import tsx --test tests/integration.test.ts
```

The test file should read the API URL and anon key from
`../boa-cars-test/.boa/config.json`:
- `apiUrl`: `https://dm2yob87lihft.cloudfront.net`
- `anonKey`: the JWT from config.json

### Fix issues

This task is deliberately open-ended. The integration tests
will likely surface issues in:

- Header formatting (CloudFront may be strict about case
  or extra headers).
- Query parameter encoding (special characters in filter
  values).
- Response parsing (pgrest-lambda may return slightly
  different shapes than expected).
- Token refresh timing (real JWT expiry values).
- CORS behavior through CloudFront.

Fix any failures in the client source code (not in the
tests, unless a test has a genuine bug).

### Test user management

The integration tests create real Cognito users. Use a
unique email per test run (e.g.,
`test-{timestamp}@boa-test.com`). There is no automated
cleanup. Note this in a comment at the top of the test file.

## Acceptance Criteria

- All integration tests pass against the live backend.
- All unit tests still pass.
- No changes to the boa-cars-test backend are needed.
- Any client library bugs found are fixed in the
  appropriate source files.

## Conflict Criteria

- If the boa-cars-test backend is unreachable or returns
  unexpected responses that suggest a backend change is
  needed, escalate with details.
- If a CloudFront/WAF configuration blocks requests that
  should succeed, escalate with the specific header or
  request pattern that is blocked.

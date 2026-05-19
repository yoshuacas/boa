# Task 09: Verify Flow Extensions

**Agent:** implementer
**Design:** docs/design/functions.md

**Depends on:** Task 05, Task 06

## Objective

Extend `boa verify` with three new checks: functions registry
parity, SSM secret presence, and route reachability.

## Target Tests

From `verify-functions.test.mjs`:
- Local matches deployed -> checks pass
- Local function not in deployed -> reports drift
- Deployed function not in local -> reports drift
- Secret declared and present in SSM -> passes
- Secret declared but missing in SSM -> reports with path
  and remediation
- Route /functions/v1/hello responds 200 or 401 -> passes
- Route responds 500 or times out -> reports unreachable

## Implementation

### cli/commands/verify.mjs

Add new check functions after the existing verification
steps. Follow the same pattern used by existing checks
(likely a list of check functions that return pass/fail
with messages).

#### Registry Parity Check

```javascript
async function checkFunctionsRegistryParity(config) {
  const local = await discoverFunctions(projectRoot);
  const deployed = await getDeployedRegistry(config);

  const localNames = new Set(local.map(f => f.name));
  const deployedNames = new Set(Object.keys(deployed));

  const onlyLocal = [...localNames].filter(n => !deployedNames.has(n));
  const onlyDeployed = [...deployedNames].filter(n => !localNames.has(n));

  // Report drift for each direction
}
```

#### SSM Secrets Check

```javascript
async function checkFunctionsSecrets(config) {
  const functions = await discoverFunctions(projectRoot);
  for (const fn of functions) {
    for (const secret of fn.secrets) {
      const paramName = `/${config.stackName}/functions/${fn.name}/${secret}`;
      const exists = await ssmParameterExists(paramName);
      if (!exists) {
        // Report with path and aws ssm put-parameter hint
      }
    }
  }
}
```

#### Route Reachability Check

```javascript
async function checkFunctionsReachability(config) {
  const functions = await discoverFunctions(projectRoot);
  const publicFns = functions.filter(f => f.visibility === 'public');

  for (const fn of publicFns) {
    const url = `${config.apiUrl}/functions/v1/${fn.name}`;
    try {
      const res = await fetch(url, {
        headers: { 'apikey': config.anonKey },
        signal: AbortSignal.timeout(5000),
      });
      if (res.status >= 500) {
        // Report unreachable
      }
      // 200, 401, 403 are all "reachable" (function is running)
    } catch (e) {
      // Timeout or network error -> report unreachable
    }
  }
}
```

### Integration with existing verify flow

Import `discoverFunctions` and add the three checks to the
verify command's check list. They should run after existing
checks so that basic stack health is confirmed first.

## Acceptance Criteria

- All `verify-functions.test.mjs` tests pass
- Registry parity reports drift in both directions
- SSM check includes remediation command in output
- Route check treats 200, 401, 403 as reachable
- Route check treats 500 and timeout as unreachable
- Existing tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If `boa verify` uses a different pattern for adding checks
  than described here (e.g., a plugin system or check
  registry), follow that existing pattern.

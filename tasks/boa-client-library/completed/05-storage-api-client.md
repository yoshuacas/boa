# Task 05: Storage, API, and Client Wiring

**Agent:** implementer
**Design:** docs/design/boa-client-library.md
**Depends on:** Task 02, Task 03, Task 04

## Objective

Implement BoaStorage, BoaApi, and the BoaClient class that
wires all modules together. Create the package entry point.

## Target Tests

From `client/tests/integration.test.ts`:
- `createUploadUrl({ filename, contentType })` returns
  `{ uploadUrl, key, error: null }`.
- `createDownloadUrl(key)` returns
  `{ downloadUrl, error: null }`.
- `client.api.getSpec()` returns the OpenAPI 3.0 spec
  as a non-null object.

From `client/tests/integration.test.ts` (client validation):
- `createClient('', anonKey)` rejects with
  `"url is required"`.
- `createClient(url, '')` rejects with
  `"anonKey is required"`.
- `createClient(url + '/', anonKey)` strips trailing slash.

From the overall integration tests:
- `createClient(url, anonKey)` returns a working client.
- `client.from('table')` returns a QueryBuilder.
- `client.auth` provides all auth methods.
- `client.storage` provides storage methods.

No dedicated unit test file for these modules -- they are
thin wrappers tested through integration tests.

## Implementation

### client/src/storage.ts

Create the `BoaStorage` class.

**Constructor:**
- `http: HttpClient` reference.

**Methods:**

`createUploadUrl(params): Promise<StorageUploadResult>`
1. POST `/upload` with `{ filename, contentType }`.
2. Map response `{ uploadUrl, key, expiresIn, maxSizeBytes,
   message }` to `{ uploadUrl, key, error: null }`.
3. On error: `{ key: null, uploadUrl: null, error }`.

`createDownloadUrl(key): Promise<StorageDownloadResult>`
1. GET `/download?key=<encodeURIComponent(key)>`.
2. Map response `{ downloadUrl }` to
   `{ downloadUrl, error: null }`.
3. On error: `{ downloadUrl: null, error }`.

### client/src/api.ts

Create the `BoaApi` class (not in the design's file list
but referenced in client.ts -- add this file).

**Constructor:**
- `http: HttpClient` reference.

**Methods:**

`getSpec(): Promise<{ spec: object | null; error: BoaError | null }>`
1. GET `/rest/v1/`.
2. Return `{ spec: parsedJson, error: null }`.
3. On error: `{ spec: null, error }`.

### client/src/client.ts

Create the `BoaClient` class.

**Constructor(url, anonKey, options?):**
1. Validate `url` is a non-empty string. Throw or return
   error: `"url is required"`.
2. Validate `anonKey` is a non-empty string. Throw or
   return error: `"anonKey is required"`.
3. Strip trailing slash from `url`.
4. Create `HttpClient` with url, anonKey, and
   `options?.headers`.
5. Create `BoaAuth` with HttpClient and
   `options?.persistSession ?? false`.
6. Create `BoaStorage` with HttpClient.
7. Create `BoaApi` with HttpClient.
8. Wire BoaAuth as the token provider for HttpClient.

**Properties:**
- `readonly auth: BoaAuth`
- `readonly storage: BoaStorage`
- `readonly api: BoaApi`

**Methods:**
- `from<T = any>(table: string): QueryBuilder<T>` --
  creates a new QueryBuilder scoped to the table.

### client/src/index.ts

The package entry point:

```typescript
export { BoaClient } from './client.js'
export { createClient } from './client.js'
export type { ... } from './types.js'
```

The `createClient` function:
```typescript
export function createClient(
  url: string,
  anonKey: string,
  options?: BoaClientOptions
): BoaClient {
  return new BoaClient(url, anonKey, options)
}
```

Re-export all public types: `BoaClient`, `BoaClientOptions`,
`Session`, `User`, `BoaError`, `AuthEvent`, `AuthListener`,
`QueryResult`, `SingleResult`, `AuthResult`,
`StorageUploadResult`, `StorageDownloadResult`.

## Acceptance Criteria

- `createClient(url, anonKey)` returns a BoaClient instance.
- `client.from('table')` returns a QueryBuilder.
- `client.auth.signIn(...)` works (delegates to BoaAuth).
- `client.storage.createUploadUrl(...)` works (delegates to
  BoaStorage).
- `client.api.getSpec()` works (delegates to BoaApi).
- Validation rejects empty url/anonKey.
- All existing unit tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.

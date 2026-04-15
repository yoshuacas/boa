import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { HttpClient } from '../src/http.js'
import type { TokenProvider } from '../src/http.js'

// Helper to create a mock Response
function mockResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): Response {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(bodyStr, {
    status,
    statusText: status === 200 ? 'OK'
      : status === 400 ? 'Bad Request'
      : status === 401 ? 'Unauthorized'
      : status === 403 ? 'Forbidden'
      : status === 500 ? 'Internal Server Error'
      : 'Unknown',
    headers: new Headers(headers),
  })
}

describe('HttpClient', () => {
  let originalFetch: typeof globalThis.fetch
  let fetchCalls: Array<{ url: string; init: RequestInit }>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchCalls = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(response: Response): void {
    globalThis.fetch = mock.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.toString()
          : input.url
        fetchCalls.push({ url, init: init ?? {} })
        return response
      }
    ) as typeof globalThis.fetch
  }

  function mockFetchSequence(responses: Response[]): void {
    let callIndex = 0
    globalThis.fetch = mock.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.toString()
          : input.url
        fetchCalls.push({ url, init: init ?? {} })
        const resp = responses[callIndex] ?? responses[responses.length - 1]
        callIndex++
        return resp
      }
    ) as typeof globalThis.fetch
  }

  function createClient(
    customHeaders?: Record<string, string>
  ): HttpClient {
    return new HttpClient(
      'https://api.example.com',
      'test-anon-key',
      customHeaders
    )
  }

  function createTokenProvider(
    overrides?: Partial<TokenProvider>
  ): TokenProvider {
    return {
      getAccessToken: () => null,
      getRefreshToken: () => null,
      onRefreshSuccess: () => {},
      onRefreshFailure: () => {},
      ...overrides,
    }
  }

  // --- Header injection ---

  describe('header injection', () => {
    it('sets apikey header to the anon key on every request', async () => {
      mockFetch(mockResponse(200, []))
      const client = createClient()
      await client.request({ method: 'GET', path: '/rest/v1/todos' })

      assert.equal(fetchCalls.length, 1, 'Expected exactly one fetch call')
      const headers = new Headers(fetchCalls[0].init.headers as HeadersInit)
      assert.equal(
        headers.get('apikey'),
        'test-anon-key',
        'apikey header should be set to the anon key'
      )
    })

    it('sets Authorization Bearer header when access token exists', async () => {
      mockFetch(mockResponse(200, []))
      const client = createClient()
      client.setTokenProvider(
        createTokenProvider({
          getAccessToken: () => 'my-access-token',
        })
      )
      await client.request({ method: 'GET', path: '/rest/v1/todos' })

      const headers = new Headers(fetchCalls[0].init.headers as HeadersInit)
      assert.equal(
        headers.get('authorization'),
        'Bearer my-access-token',
        'Authorization header should contain the access token'
      )
    })

    it('sets Content-Type application/json on POST with body', async () => {
      mockFetch(mockResponse(200, {}))
      const client = createClient()
      await client.request({
        method: 'POST',
        path: '/rest/v1/todos',
        body: { title: 'test' },
      })

      const headers = new Headers(fetchCalls[0].init.headers as HeadersInit)
      assert.equal(
        headers.get('content-type'),
        'application/json',
        'Content-Type should be application/json for POST with body'
      )
    })

    it('sets Content-Type application/json on PATCH with body', async () => {
      mockFetch(mockResponse(200, {}))
      const client = createClient()
      await client.request({
        method: 'PATCH',
        path: '/rest/v1/todos',
        body: { title: 'updated' },
      })

      const headers = new Headers(fetchCalls[0].init.headers as HeadersInit)
      assert.equal(
        headers.get('content-type'),
        'application/json',
        'Content-Type should be application/json for PATCH with body'
      )
    })

    it('does not set Content-Type on GET requests', async () => {
      mockFetch(mockResponse(200, []))
      const client = createClient()
      await client.request({ method: 'GET', path: '/rest/v1/todos' })

      const headers = new Headers(fetchCalls[0].init.headers as HeadersInit)
      assert.equal(
        headers.get('content-type'),
        null,
        'Content-Type should not be set on GET requests'
      )
    })

    it('does not set Content-Type on DELETE without body', async () => {
      mockFetch(mockResponse(200, {}))
      const client = createClient()
      await client.request({
        method: 'DELETE',
        path: '/rest/v1/todos',
      })

      const headers = new Headers(fetchCalls[0].init.headers as HeadersInit)
      assert.equal(
        headers.get('content-type'),
        null,
        'Content-Type should not be set on DELETE without body'
      )
    })

    it('includes custom headers from client options', async () => {
      mockFetch(mockResponse(200, []))
      const client = createClient({ 'X-Custom': 'val' })
      await client.request({ method: 'GET', path: '/rest/v1/todos' })

      const headers = new Headers(fetchCalls[0].init.headers as HeadersInit)
      assert.equal(
        headers.get('x-custom'),
        'val',
        'Custom header X-Custom should be included'
      )
    })
  })

  // --- Error parsing ---

  describe('error parsing', () => {
    it('parses PostgREST error body with code, message, details, hint', async () => {
      const errorBody = {
        code: 'PGRST204',
        message: 'Column not found',
        details: 'Could not find column xyz',
        hint: 'Check column name',
      }
      mockFetch(mockResponse(400, errorBody))
      const client = createClient()
      const result = await client.request({
        method: 'GET',
        path: '/rest/v1/todos',
      })

      assert.notEqual(result.error, null, 'Error should not be null')
      assert.equal(
        result.error!.code,
        'PGRST204',
        'Error code should be PGRST204'
      )
      assert.equal(
        result.error!.message,
        'Column not found',
        'Error message should match'
      )
      assert.equal(
        result.error!.details,
        'Could not find column xyz',
        'Error details should match'
      )
      assert.equal(
        result.error!.hint,
        'Check column name',
        'Error hint should match'
      )
    })

    it('parses GoTrue error body mapping error_description to message', async () => {
      const errorBody = {
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
      }
      mockFetch(mockResponse(400, errorBody))
      const client = createClient()
      const result = await client.request({
        method: 'POST',
        path: '/auth/v1/token',
      })

      assert.notEqual(result.error, null, 'Error should not be null')
      assert.equal(
        result.error!.message,
        'Invalid login credentials',
        'error_description should become error.message'
      )
    })

    it('uses HTTP status text for unparseable response body', async () => {
      const resp = new Response('not json at all!!!', {
        status: 500,
        statusText: 'Internal Server Error',
      })
      globalThis.fetch = mock.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = typeof input === 'string' ? input
            : input instanceof URL ? input.toString()
            : input.url
          fetchCalls.push({ url, init: init ?? {} })
          return resp
        }
      ) as typeof globalThis.fetch
      const client = createClient()
      const result = await client.request({
        method: 'GET',
        path: '/rest/v1/todos',
      })

      assert.notEqual(result.error, null, 'Error should not be null')
      assert.equal(
        result.error!.message,
        'Internal Server Error',
        'Error message should be the HTTP status text'
      )
    })

    it('returns "Network request failed" on fetch throw', async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new TypeError('Failed to fetch')
      }) as typeof globalThis.fetch
      const client = createClient()
      const result = await client.request({
        method: 'GET',
        path: '/rest/v1/todos',
      })

      assert.notEqual(result.error, null, 'Error should not be null')
      assert.equal(
        result.error!.message,
        'Network request failed',
        'Error message should be "Network request failed"'
      )
    })
  })

  // --- 401 retry ---

  describe('401 retry', () => {
    it('retries with new token after 401 when refresh succeeds', async () => {
      // First call returns 401, refresh call succeeds,
      // replayed call returns 200
      const refreshResponse = mockResponse(200, {
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        user: { id: '1', email: 'a@b.com', role: 'authenticated' },
      })
      const successResponse = mockResponse(200, [{ id: 1 }])
      const unauthorizedResponse = mockResponse(
        401,
        { error: 'unauthorized', error_description: 'JWT expired' }
      )

      mockFetchSequence([
        unauthorizedResponse,
        refreshResponse,
        successResponse,
      ])

      let refreshSuccessCalled = false
      const client = createClient()
      client.setTokenProvider(
        createTokenProvider({
          getAccessToken: () => 'expired-token',
          getRefreshToken: () => 'valid-refresh-token',
          onRefreshSuccess: () => { refreshSuccessCalled = true },
        })
      )

      const result = await client.request({
        method: 'GET',
        path: '/rest/v1/todos',
      })

      assert.equal(fetchCalls.length, 3, 'Expected 3 fetch calls: original + refresh + replay')
      // Verify the refresh endpoint was called
      assert.ok(
        fetchCalls[1].url.includes('/auth/v1/token?grant_type=refresh_token'),
        'Second call should be to the refresh endpoint'
      )
      assert.equal(
        result.error,
        null,
        'Final result should have no error after successful retry'
      )
      assert.ok(
        refreshSuccessCalled,
        'onRefreshSuccess should have been called'
      )
    })

    it('returns original 401 error and fires SIGNED_OUT on failed refresh', async () => {
      const unauthorizedResponse = mockResponse(
        401,
        { error: 'unauthorized', error_description: 'JWT expired' }
      )
      const refreshFailResponse = mockResponse(
        400,
        { error: 'invalid_grant', error_description: 'Refresh token expired' }
      )

      mockFetchSequence([unauthorizedResponse, refreshFailResponse])

      let refreshFailureCalled = false
      const client = createClient()
      client.setTokenProvider(
        createTokenProvider({
          getAccessToken: () => 'expired-token',
          getRefreshToken: () => 'expired-refresh-token',
          onRefreshFailure: () => { refreshFailureCalled = true },
        })
      )

      const result = await client.request({
        method: 'GET',
        path: '/rest/v1/todos',
      })

      assert.notEqual(
        result.error,
        null,
        'Error should not be null after failed refresh'
      )
      assert.equal(
        result.status,
        401,
        'Status should be 401 from the original request'
      )
      assert.ok(
        refreshFailureCalled,
        'onRefreshFailure should have been called (SIGNED_OUT)'
      )
    })

    it('retries only once per request (no infinite loop)', async () => {
      // Both original and replayed requests return 401
      const unauthorizedResponse1 = mockResponse(
        401,
        { error: 'unauthorized', error_description: 'JWT expired' }
      )
      const refreshResponse = mockResponse(200, {
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        user: { id: '1', email: 'a@b.com', role: 'authenticated' },
      })
      const unauthorizedResponse2 = mockResponse(
        401,
        { error: 'unauthorized', error_description: 'Still expired' }
      )

      mockFetchSequence([
        unauthorizedResponse1,
        refreshResponse,
        unauthorizedResponse2,
      ])

      const client = createClient()
      client.setTokenProvider(
        createTokenProvider({
          getAccessToken: () => 'expired-token',
          getRefreshToken: () => 'valid-refresh-token',
        })
      )

      const result = await client.request({
        method: 'GET',
        path: '/rest/v1/todos',
      })

      assert.equal(
        fetchCalls.length,
        3,
        'Should make exactly 3 calls: original + refresh + one replay (no further retry)'
      )
      assert.equal(
        result.status,
        401,
        'Should return 401 from the replayed request without retrying again'
      )
    })

    it('does not retry on 403 responses', async () => {
      mockFetch(mockResponse(
        403,
        { error: 'forbidden', error_description: 'Access denied' }
      ))

      const client = createClient()
      client.setTokenProvider(
        createTokenProvider({
          getAccessToken: () => 'my-token',
          getRefreshToken: () => 'my-refresh',
        })
      )

      const result = await client.request({
        method: 'GET',
        path: '/rest/v1/todos',
      })

      assert.equal(
        fetchCalls.length,
        1,
        'Should make only one fetch call (no retry for 403)'
      )
      assert.equal(
        result.status,
        403,
        'Should return 403 status'
      )
    })
  })
})

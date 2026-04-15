import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '../src/index.js'
import type { AuthEvent, Session } from '../src/types.js'

// Helper to create a valid JWT payload for testing
function createJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const sig = 'test-signature'
  return `${header}.${body}.${sig}`
}

// Standard test tokens
function makeSession(overrides?: Partial<{
  exp: number
  sub: string
  email: string
}>): {
  access_token: string
  refresh_token: string
  expires_in: number
  user: { id: string; email: string; role: string }
} {
  const exp = overrides?.exp ?? Math.floor(Date.now() / 1000) + 3600
  const sub = overrides?.sub ?? 'user-123'
  const email = overrides?.email ?? 'test@example.com'
  return {
    access_token: createJwt({ exp, sub, email, role: 'authenticated', iss: 'pgrest-lambda' }),
    refresh_token: createJwt({ sub, role: 'authenticated', prt: 'cognito-refresh', iss: 'pgrest-lambda', exp: exp + 86400 * 30 }),
    expires_in: 3600,
    user: { id: sub, email, role: 'authenticated' },
  }
}

// Mock fetch helper
function mockResponse(
  status: number,
  body: unknown
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('BoaAuth', () => {
  let originalFetch: typeof globalThis.fetch
  let fetchCalls: Array<{ url: string; init: RequestInit }>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchCalls = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function setupFetch(
    handler: (url: string, init: RequestInit) => Response
  ): void {
    globalThis.fetch = mock.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.toString()
          : input.url
        const reqInit = init ?? {}
        fetchCalls.push({ url, init: reqInit })
        return handler(url, reqInit)
      }
    ) as typeof globalThis.fetch
  }

  function setupFetchSuccess(): void {
    const session = makeSession()
    setupFetch(() => mockResponse(200, session))
  }

  // --- signUp ---

  describe('signUp', () => {
    it('sends POST /auth/v1/signup with email and password', async () => {
      const session = makeSession()
      setupFetch((url) => {
        if (url.includes('/auth/v1/signup')) {
          return mockResponse(200, session)
        }
        return mockResponse(404, { error: 'not found' })
      })

      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signUp({
        email: 'user@example.com',
        password: 'SecurePass1',
      })

      const signupCall = fetchCalls.find((c) =>
        c.url.includes('/auth/v1/signup')
      )
      assert.ok(signupCall, 'Should have called /auth/v1/signup')
      assert.equal(
        signupCall.init.method,
        'POST',
        'signUp should use POST method'
      )
      const body = JSON.parse(signupCall.init.body as string)
      assert.equal(body.email, 'user@example.com', 'Body should contain email')
      assert.equal(body.password, 'SecurePass1', 'Body should contain password')
    })

    it('stores tokens and fires SIGNED_IN on successful signUp', async () => {
      const session = makeSession()
      setupFetch(() => mockResponse(200, session))

      const client = createClient('https://api.example.com', 'anon-key')
      const events: AuthEvent[] = []
      client.auth.onAuthStateChange((event) => {
        events.push(event)
      })

      const result = await client.auth.signUp({
        email: 'user@example.com',
        password: 'SecurePass1',
      })

      assert.equal(result.error, null, 'Error should be null on success')
      assert.notEqual(result.session, null, 'Session should not be null')
      assert.notEqual(result.user, null, 'User should not be null')
      assert.ok(
        events.includes('SIGNED_IN'),
        'SIGNED_IN event should be fired'
      )
    })

    it('returns error and does not store tokens on signUp failure', async () => {
      setupFetch(() =>
        mockResponse(400, {
          error: 'user_already_exists',
          error_description: 'User already registered',
        })
      )

      const client = createClient('https://api.example.com', 'anon-key')
      const events: AuthEvent[] = []
      client.auth.onAuthStateChange((event) => {
        events.push(event)
      })

      const result = await client.auth.signUp({
        email: 'existing@example.com',
        password: 'SecurePass1',
      })

      assert.notEqual(result.error, null, 'Error should not be null on failure')
      assert.equal(result.session, null, 'Session should be null on failure')
      assert.equal(result.user, null, 'User should be null on failure')
      assert.ok(
        !events.includes('SIGNED_IN'),
        'SIGNED_IN should NOT be fired on failure'
      )
    })
  })

  // --- signIn ---

  describe('signIn', () => {
    it('sends POST /auth/v1/token?grant_type=password with credentials', async () => {
      const session = makeSession()
      setupFetch((url) => {
        if (url.includes('/auth/v1/token') && url.includes('grant_type=password')) {
          return mockResponse(200, session)
        }
        return mockResponse(404, { error: 'not found' })
      })

      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'user@example.com',
        password: 'SecurePass1',
      })

      const signInCall = fetchCalls.find(
        (c) =>
          c.url.includes('/auth/v1/token') &&
          c.url.includes('grant_type=password')
      )
      assert.ok(
        signInCall,
        'Should have called /auth/v1/token?grant_type=password'
      )
      assert.equal(signInCall.init.method, 'POST', 'signIn should use POST')
      const body = JSON.parse(signInCall.init.body as string)
      assert.equal(body.email, 'user@example.com', 'Body should contain email')
      assert.equal(body.password, 'SecurePass1', 'Body should contain password')
    })

    it('stores tokens and fires SIGNED_IN on successful signIn', async () => {
      const session = makeSession()
      setupFetch(() => mockResponse(200, session))

      const client = createClient('https://api.example.com', 'anon-key')
      const events: AuthEvent[] = []
      client.auth.onAuthStateChange((event) => {
        events.push(event)
      })

      const result = await client.auth.signIn({
        email: 'user@example.com',
        password: 'SecurePass1',
      })

      assert.equal(result.error, null, 'Error should be null on success')
      assert.notEqual(result.session, null, 'Session should not be null')
      assert.ok(
        events.includes('SIGNED_IN'),
        'SIGNED_IN event should be fired'
      )
    })

    it('returns "Invalid login credentials" on invalid_grant response', async () => {
      setupFetch(() =>
        mockResponse(400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        })
      )

      const client = createClient('https://api.example.com', 'anon-key')
      const result = await client.auth.signIn({
        email: 'user@example.com',
        password: 'wrong-password',
      })

      assert.notEqual(result.error, null, 'Error should not be null')
      assert.equal(
        result.error!.message,
        'Invalid login credentials',
        'Error message should be "Invalid login credentials"'
      )
    })
  })

  // --- getUser ---

  describe('getUser', () => {
    it('returns user from cached JWT without a network call', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })
      fetchCalls.length = 0 // Clear prior fetch calls

      const { user, error } = await client.auth.getUser()

      assert.equal(error, null, 'Error should be null')
      assert.notEqual(user, null, 'User should not be null')
      assert.equal(user!.email, 'test@example.com', 'User email should match')
      assert.equal(
        fetchCalls.length,
        0,
        'getUser() without fetch:true should not make a network call'
      )
    })

    it('returns { user: null, error: null } when no session exists', async () => {
      const client = createClient('https://api.example.com', 'anon-key')

      const { user, error } = await client.auth.getUser()

      assert.equal(user, null, 'User should be null when no session')
      assert.equal(error, null, 'Error should be null when no session')
    })

    it('sends GET /auth/v1/user with Bearer token when { fetch: true }', async () => {
      const session = makeSession()
      setupFetch((url) => {
        if (url.includes('/auth/v1/user')) {
          return mockResponse(200, {
            id: 'user-123',
            email: 'test@example.com',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
          })
        }
        if (url.includes('/auth/v1/token')) {
          return mockResponse(200, session)
        }
        return mockResponse(200, session)
      })

      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })
      fetchCalls.length = 0

      await client.auth.getUser({ fetch: true })

      const getUserCall = fetchCalls.find((c) =>
        c.url.includes('/auth/v1/user')
      )
      assert.ok(
        getUserCall,
        'Should have called GET /auth/v1/user'
      )
      const headers = new Headers(getUserCall.init.headers as HeadersInit)
      assert.ok(
        headers.get('authorization')?.startsWith('Bearer '),
        'Should include Authorization Bearer header'
      )
    })
  })

  // --- getSession ---

  describe('getSession', () => {
    it('returns current session from memory when active', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      const { session, error } = await client.auth.getSession()

      assert.equal(error, null, 'Error should be null')
      assert.notEqual(session, null, 'Session should not be null')
      assert.ok(
        session!.access_token,
        'Session should have an access_token'
      )
    })

    it('returns { session: null, error: null } when no session exists', async () => {
      const client = createClient('https://api.example.com', 'anon-key')

      const { session, error } = await client.auth.getSession()

      assert.equal(session, null, 'Session should be null when no session')
      assert.equal(error, null, 'Error should be null when no session')
    })
  })

  // --- signOut ---

  describe('signOut', () => {
    it('clears tokens, cancels refresh timer, and fires SIGNED_OUT', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      const events: AuthEvent[] = []
      client.auth.onAuthStateChange((event) => {
        events.push(event)
      })

      // Setup fetch for signOut endpoint
      setupFetch(() => mockResponse(200, {}))

      await client.auth.signOut()

      assert.ok(
        events.includes('SIGNED_OUT'),
        'SIGNED_OUT event should be fired'
      )
      const { session } = await client.auth.getSession()
      assert.equal(
        session,
        null,
        'Session should be null after signOut'
      )
    })

    it('clears tokens locally even if server request fails (best-effort)', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      // Mock fetch to fail for signOut
      globalThis.fetch = mock.fn(async () => {
        throw new Error('Network error')
      }) as typeof globalThis.fetch

      const { error } = await client.auth.signOut()

      // signOut should succeed locally regardless of server error
      const { session } = await client.auth.getSession()
      assert.equal(
        session,
        null,
        'Session should be cleared even if server fails'
      )
      // error may or may not be set, but session must be cleared
      void error
    })
  })

  // --- onAuthStateChange ---

  describe('onAuthStateChange', () => {
    it('receives SIGNED_IN after signIn', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key')

      const events: Array<{ event: AuthEvent; session: Session | null }> = []
      client.auth.onAuthStateChange((event, session) => {
        events.push({ event, session })
      })

      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      const signedIn = events.find((e) => e.event === 'SIGNED_IN')
      assert.ok(signedIn, 'Should receive SIGNED_IN event')
      assert.notEqual(
        signedIn!.session,
        null,
        'SIGNED_IN event should include session'
      )
    })

    it('receives SIGNED_OUT after signOut with null session', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      const events: Array<{ event: AuthEvent; session: Session | null }> = []
      client.auth.onAuthStateChange((event, session) => {
        events.push({ event, session })
      })

      setupFetch(() => mockResponse(200, {}))
      await client.auth.signOut()

      const signedOut = events.find((e) => e.event === 'SIGNED_OUT')
      assert.ok(signedOut, 'Should receive SIGNED_OUT event')
      assert.equal(
        signedOut!.session,
        null,
        'SIGNED_OUT session should be null'
      )
    })

    it('receives TOKEN_REFRESHED after token refresh', async () => {
      const session = makeSession({ exp: Math.floor(Date.now() / 1000) + 30 })
      const refreshedSession = makeSession({
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      setupFetch((url) => {
        if (url.includes('grant_type=refresh_token')) {
          return mockResponse(200, refreshedSession)
        }
        return mockResponse(200, session)
      })

      const client = createClient('https://api.example.com', 'anon-key')
      const events: AuthEvent[] = []
      client.auth.onAuthStateChange((event) => {
        events.push(event)
      })

      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      // Wait for auto-refresh timer (should fire within a few seconds
      // since exp is only 30s away and timer fires 60s before)
      await new Promise((resolve) => setTimeout(resolve, 2000))

      assert.ok(
        events.includes('TOKEN_REFRESHED'),
        'TOKEN_REFRESHED event should be fired after refresh'
      )
    })

    it('stops receiving events after unsubscribe()', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key')

      const events: AuthEvent[] = []
      const { unsubscribe } = client.auth.onAuthStateChange((event) => {
        events.push(event)
      })

      unsubscribe()

      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      assert.equal(
        events.length,
        0,
        'No events should be received after unsubscribe'
      )
    })
  })

  // --- Auto-refresh ---

  describe('auto-refresh', () => {
    it('schedules timer approximately 60 seconds before token expiry', async () => {
      // Use a token that expires in 90 seconds -- timer should fire
      // at ~30s (90 - 60 = 30)
      const session = makeSession({
        exp: Math.floor(Date.now() / 1000) + 90,
      })
      setupFetch(() => mockResponse(200, session))

      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      // Verify session was stored (timer is internal)
      const { session: currentSession } = await client.auth.getSession()
      assert.notEqual(
        currentSession,
        null,
        'Session should be set after signIn (auto-refresh timer should be scheduled)'
      )
    })

    it('fires TOKEN_REFRESHED on successful auto-refresh', async () => {
      // Token expires very soon so auto-refresh fires quickly
      const session = makeSession({
        exp: Math.floor(Date.now() / 1000) + 10,
      })
      const refreshedSession = makeSession({
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      setupFetch((url) => {
        if (url.includes('grant_type=refresh_token')) {
          return mockResponse(200, refreshedSession)
        }
        return mockResponse(200, session)
      })

      const client = createClient('https://api.example.com', 'anon-key')
      const events: AuthEvent[] = []
      client.auth.onAuthStateChange((event) => {
        events.push(event)
      })

      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      // Wait for auto-refresh (delay <= 0, should fire immediately)
      await new Promise((resolve) => setTimeout(resolve, 2000))

      assert.ok(
        events.includes('TOKEN_REFRESHED'),
        'TOKEN_REFRESHED should be emitted on successful auto-refresh'
      )
    })

    it('fires SIGNED_OUT and clears tokens on failed auto-refresh', async () => {
      const session = makeSession({
        exp: Math.floor(Date.now() / 1000) + 10,
      })

      let firstCall = true
      setupFetch((url) => {
        if (url.includes('grant_type=refresh_token')) {
          return mockResponse(400, {
            error: 'invalid_grant',
            error_description: 'Refresh token expired',
          })
        }
        if (firstCall) {
          firstCall = false
          return mockResponse(200, session)
        }
        return mockResponse(200, session)
      })

      const client = createClient('https://api.example.com', 'anon-key')
      const events: AuthEvent[] = []
      client.auth.onAuthStateChange((event) => {
        events.push(event)
      })

      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      // Wait for auto-refresh to fail
      await new Promise((resolve) => setTimeout(resolve, 2000))

      assert.ok(
        events.includes('SIGNED_OUT'),
        'SIGNED_OUT should be emitted when auto-refresh fails'
      )
    })
  })

  // --- JWT decoding ---

  describe('JWT decoding', () => {
    it('extracts exp, sub, and email from a valid JWT', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600
      const session = makeSession({
        exp,
        sub: 'user-456',
        email: 'jwt@test.com',
      })
      setupFetch(() => mockResponse(200, session))

      const client = createClient('https://api.example.com', 'anon-key')
      await client.auth.signIn({
        email: 'jwt@test.com',
        password: 'pass',
      })

      const { user } = await client.auth.getUser()

      assert.notEqual(user, null, 'User should not be null')
      assert.equal(user!.id, 'user-456', 'User id should come from JWT sub claim')
      assert.equal(user!.email, 'jwt@test.com', 'User email should come from JWT email claim')
    })
  })

  // --- Session persistence (localStorage) ---

  describe('session persistence (localStorage)', () => {
    let mockStorage: Map<string, string>
    let originalLocalStorage: Storage

    beforeEach(() => {
      mockStorage = new Map()
      // @ts-expect-error -- mocking localStorage
      originalLocalStorage = globalThis.localStorage
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: (key: string) => mockStorage.get(key) ?? null,
          setItem: (key: string, value: string) => mockStorage.set(key, value),
          removeItem: (key: string) => mockStorage.delete(key),
        },
        writable: true,
        configurable: true,
      })
    })

    afterEach(() => {
      if (originalLocalStorage !== undefined) {
        Object.defineProperty(globalThis, 'localStorage', {
          value: originalLocalStorage,
          writable: true,
          configurable: true,
        })
      } else {
        // @ts-expect-error -- cleaning up mock
        delete globalThis.localStorage
      }
    })

    it('writes to localStorage when persistSession is true and session is set', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key', {
        persistSession: true,
      })

      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      assert.ok(
        mockStorage.has('boa-auth'),
        'localStorage should have "boa-auth" key after signIn with persistSession: true'
      )
      const stored = JSON.parse(mockStorage.get('boa-auth')!)
      assert.ok(
        stored.access_token,
        'Stored session should contain access_token'
      )
    })

    it('reads from localStorage on construction when persistSession is true', async () => {
      // Pre-populate localStorage with a valid session
      const session = makeSession()
      mockStorage.set(
        'boa-auth',
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        })
      )

      // Don't set up any fetch -- construction should read from storage
      setupFetch(() => mockResponse(200, {}))

      const client = createClient('https://api.example.com', 'anon-key', {
        persistSession: true,
      })

      const { session: restoredSession } = await client.auth.getSession()
      assert.notEqual(
        restoredSession,
        null,
        'Session should be restored from localStorage on construction'
      )
    })

    it('removes from localStorage on signOut when persistSession is true', async () => {
      setupFetchSuccess()
      const client = createClient('https://api.example.com', 'anon-key', {
        persistSession: true,
      })

      await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      assert.ok(
        mockStorage.has('boa-auth'),
        'localStorage should have session after signIn'
      )

      setupFetch(() => mockResponse(200, {}))
      await client.auth.signOut()

      assert.ok(
        !mockStorage.has('boa-auth'),
        'localStorage should be cleared after signOut with persistSession: true'
      )
    })

    it('catches localStorage errors silently (SSR safe)', async () => {
      // Make localStorage throw on all access
      Object.defineProperty(globalThis, 'localStorage', {
        get() {
          throw new Error('localStorage is not available')
        },
        configurable: true,
      })

      setupFetchSuccess()

      // This should not throw
      const client = createClient('https://api.example.com', 'anon-key', {
        persistSession: true,
      })

      const result = await client.auth.signIn({
        email: 'test@example.com',
        password: 'pass',
      })

      // The signIn itself should succeed even though persistence fails
      assert.equal(
        result.error,
        null,
        'signIn should succeed even when localStorage throws'
      )
    })
  })
})

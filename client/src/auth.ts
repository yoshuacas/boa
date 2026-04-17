import type { HttpClient, TokenProvider } from './http.js'
import type {
  AuthEvent,
  AuthListener,
  AuthResult,
  BoaError,
  Session,
  User,
} from './types.js'

const STORAGE_KEY = 'boa-auth'

export class BoaAuth implements TokenProvider {
  private _http: HttpClient
  private _session: Session | null
  private _listeners: Set<AuthListener>
  private _refreshTimer: ReturnType<typeof setTimeout> | null
  private _persistSession: boolean

  constructor(http: HttpClient, persistSession: boolean) {
    this._http = http
    this._session = null
    this._listeners = new Set()
    this._refreshTimer = null
    this._persistSession = persistSession

    if (persistSession) {
      this._restoreSession()
    }
  }

  // --- TokenProvider interface ---

  getAccessToken(): string | null {
    return this._session?.access_token ?? null
  }

  getRefreshToken(): string | null {
    return this._session?.refresh_token ?? null
  }

  onRefreshSuccess(session: unknown): void {
    const s = this._buildSession(session as Record<string, unknown>)
    if (s) {
      this._setSession(s, 'TOKEN_REFRESHED')
    }
  }

  onRefreshFailure(): void {
    this._clearSession()
  }

  // --- Public methods ---

  async signUp(
    credentials: { email: string; password: string }
  ): Promise<AuthResult> {
    const { data, error } = await this._http.request<
      Record<string, unknown>
    >({
      method: 'POST',
      path: '/auth/v1/signup',
      body: {
        email: credentials.email,
        password: credentials.password,
      },
    })

    if (error || !data) {
      return { user: null, session: null, error }
    }

    const session = this._buildSession(data)
    if (!session) {
      return {
        user: null,
        session: null,
        error: { message: 'Invalid server response' },
      }
    }

    this._setSession(session, 'SIGNED_IN')
    return { user: session.user, session, error: null }
  }

  async signIn(
    credentials: { email: string; password: string }
  ): Promise<AuthResult> {
    const { data, error } = await this._http.request<
      Record<string, unknown>
    >({
      method: 'POST',
      path: '/auth/v1/token?grant_type=password',
      body: {
        email: credentials.email,
        password: credentials.password,
      },
    })

    if (error || !data) {
      return { user: null, session: null, error }
    }

    const session = this._buildSession(data)
    if (!session) {
      return {
        user: null,
        session: null,
        error: { message: 'Invalid server response' },
      }
    }

    this._setSession(session, 'SIGNED_IN')
    return { user: session.user, session, error: null }
  }

  async getUser(
    options?: { fetch?: boolean }
  ): Promise<{ user: User | null; error: BoaError | null }> {
    if (!this._session) {
      return { user: null, error: null }
    }

    if (options?.fetch) {
      const { data, error } = await this._http.request<
        Record<string, unknown>
      >({
        method: 'GET',
        path: '/auth/v1/user',
      })

      if (error || !data) {
        return { user: null, error }
      }

      const user: User = {
        id: (data.id ?? data.sub) as string,
        email: data.email as string,
        role: (data.role ?? 'authenticated') as string,
        raw: data,
      }
      return { user, error: null }
    }

    const payload = this._decodeJwtPayload(
      this._session.access_token
    )
    if (!payload) {
      return { user: null, error: null }
    }

    const user: User = {
      id: payload.sub as string,
      email: payload.email as string,
      role: (payload.role ?? 'authenticated') as string,
    }
    return { user, error: null }
  }

  async getSession(): Promise<{
    session: Session | null
    error: BoaError | null
  }> {
    return { session: this._session, error: null }
  }

  onAuthStateChange(
    listener: AuthListener
  ): { unsubscribe: () => void } {
    this._listeners.add(listener)
    return {
      unsubscribe: () => {
        this._listeners.delete(listener)
      },
    }
  }

  async signOut(): Promise<{ error: BoaError | null }> {
    try {
      await this._http.request({
        method: 'POST',
        path: '/auth/v1/logout',
      })
    } catch {
      // Best-effort: ignore server errors
    }

    this._clearSession()
    return { error: null }
  }

  get session(): Session | null {
    return this._session
  }

  // --- Private methods ---

  private _setSession(
    session: Session,
    event: AuthEvent
  ): void {
    this._session = session
    this._notify(event, session)
    this._scheduleRefresh()
    this._persistToStorage()
  }

  private _clearSession(): void {
    this._session = null
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer)
      this._refreshTimer = null
    }
    this._notify('SIGNED_OUT', null)
    this._clearStorage()
  }

  private _notify(
    event: AuthEvent,
    session: Session | null
  ): void {
    for (const listener of this._listeners) {
      listener(event, session)
    }
  }

  private _scheduleRefresh(): void {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer)
      this._refreshTimer = null
    }

    if (!this._session) return

    const payload = this._decodeJwtPayload(
      this._session.access_token
    )
    if (!payload?.exp) return

    const exp = payload.exp as number
    const now = Math.floor(Date.now() / 1000)
    const delay = (exp - now - 60) * 1000

    if (delay <= 0) {
      this._refreshTimer = setTimeout(
        () => this._doRefresh(),
        0
      )
    } else {
      this._refreshTimer = setTimeout(
        () => this._doRefresh(),
        delay
      )
    }
  }

  private async _doRefresh(): Promise<void> {
    if (!this._session?.refresh_token) {
      this._clearSession()
      return
    }

    const { data, error } = await this._http.request<
      Record<string, unknown>
    >({
      method: 'POST',
      path: '/auth/v1/token?grant_type=refresh_token',
      body: { refresh_token: this._session.refresh_token },
    })

    if (error || !data) {
      this._clearSession()
      return
    }

    const session = this._buildSession(data)
    if (!session) {
      this._clearSession()
      return
    }

    this._setSession(session, 'TOKEN_REFRESHED')
  }

  private _buildSession(
    data: Record<string, unknown>
  ): Session | null {
    const accessToken = data.access_token as string | undefined
    const refreshToken = data.refresh_token as string | undefined
    const expiresIn = data.expires_in as number | undefined

    if (!accessToken || !refreshToken) return null

    const payload = this._decodeJwtPayload(accessToken)
    const user: User = data.user
      ? {
          id: (data.user as Record<string, unknown>).id as string,
          email: (data.user as Record<string, unknown>)
            .email as string,
          role: ((data.user as Record<string, unknown>).role ??
            'authenticated') as string,
        }
      : {
          id: (payload?.sub ?? '') as string,
          email: (payload?.email ?? '') as string,
          role: ((payload?.role as string) ??
            'authenticated') as string,
        }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn ?? 3600,
      user,
    }
  }

  private _decodeJwtPayload(
    token: string
  ): Record<string, unknown> | null {
    try {
      const parts = token.split('.')
      if (parts.length < 2) return null

      let base64 = parts[1]
      base64 = base64.replace(/-/g, '+').replace(/_/g, '/')
      const pad = base64.length % 4
      if (pad) {
        base64 += '='.repeat(4 - pad)
      }

      let decoded: string
      try {
        decoded = atob(base64)
      } catch {
        decoded = Buffer.from(base64, 'base64').toString('utf-8')
      }

      return JSON.parse(decoded)
    } catch {
      return null
    }
  }

  private _persistToStorage(): void {
    if (!this._persistSession || !this._session) return

    try {
      const payload = this._decodeJwtPayload(
        this._session.access_token
      )
      const expiresAt = payload?.exp as number | undefined
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          access_token: this._session.access_token,
          refresh_token: this._session.refresh_token,
          expires_at:
            expiresAt ??
            Math.floor(Date.now() / 1000) +
              this._session.expires_in,
        })
      )
    } catch {
      // SSR safe: localStorage may not be available
    }
  }

  private _clearStorage(): void {
    if (!this._persistSession) return

    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // SSR safe
    }
  }

  private _restoreSession(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const stored = JSON.parse(raw) as {
        access_token: string
        refresh_token: string
        expires_at: number
      }

      if (!stored.access_token || !stored.refresh_token) return

      const now = Math.floor(Date.now() / 1000)

      if (stored.expires_at > now) {
        // Access token still valid: restore session
        const payload = this._decodeJwtPayload(
          stored.access_token
        )
        const user: User = {
          id: (payload?.sub ?? '') as string,
          email: (payload?.email ?? '') as string,
          role: ((payload?.role as string) ??
            'authenticated') as string,
        }

        this._session = {
          access_token: stored.access_token,
          refresh_token: stored.refresh_token,
          expires_in: stored.expires_at - now,
          user,
        }
        this._scheduleRefresh()
      } else {
        // Access token expired: try refresh
        this._session = {
          access_token: stored.access_token,
          refresh_token: stored.refresh_token,
          expires_in: 0,
          user: { id: '', email: '', role: 'authenticated' },
        }
        this._doRefresh()
      }
    } catch {
      // SSR safe: localStorage may not be available
    }
  }
}

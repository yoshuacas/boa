import type { HttpClient } from './http.js'
import type {
  AuthEvent,
  AuthListener,
  AuthResult,
  BoaError,
  Session,
  User,
} from './types.js'

export class BoaAuth {
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
  }

  async signUp(
    _credentials: { email: string; password: string }
  ): Promise<AuthResult> {
    throw new Error('not implemented')
  }

  async signIn(
    _credentials: { email: string; password: string }
  ): Promise<AuthResult> {
    throw new Error('not implemented')
  }

  async getUser(
    _options?: { fetch?: boolean }
  ): Promise<{ user: User | null; error: BoaError | null }> {
    throw new Error('not implemented')
  }

  async getSession(): Promise<{
    session: Session | null
    error: BoaError | null
  }> {
    throw new Error('not implemented')
  }

  onAuthStateChange(
    _listener: AuthListener
  ): { unsubscribe: () => void } {
    throw new Error('not implemented')
  }

  async signOut(): Promise<{ error: BoaError | null }> {
    throw new Error('not implemented')
  }

  // Expose internal session for testing/token provider
  get session(): Session | null {
    return this._session
  }

  // Suppress unused warnings
  private _suppress() {
    void this._http
    void this._listeners
    void this._refreshTimer
    void this._persistSession
    void this._session
  }
}

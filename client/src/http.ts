import type { BoaError } from './types.js'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  method: HttpMethod
  path: string
  body?: unknown
  headers?: Record<string, string>
  parseJson?: boolean
}

export interface HttpResponse<T> {
  data: T | null
  error: BoaError | null
  status: number
  headers: Headers
}

export interface TokenProvider {
  getAccessToken(): string | null
  getRefreshToken(): string | null
  onRefreshSuccess(session: unknown): void
  onRefreshFailure(): void
}

export class HttpClient {
  private _url: string
  private _anonKey: string
  private _customHeaders: Record<string, string>
  private _tokenProvider: TokenProvider | null

  constructor(
    url: string,
    anonKey: string,
    customHeaders?: Record<string, string>
  ) {
    this._url = url
    this._anonKey = anonKey
    this._customHeaders = customHeaders ?? {}
    this._tokenProvider = null
  }

  setTokenProvider(provider: TokenProvider): void {
    this._tokenProvider = provider
  }

  get url(): string {
    return this._url
  }

  get anonKey(): string {
    return this._anonKey
  }

  async request<T>(_options: RequestOptions): Promise<HttpResponse<T>> {
    throw new Error('not implemented')
  }
}

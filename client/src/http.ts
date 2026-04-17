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

  async request<T>(
    options: RequestOptions,
    _retried = false
  ): Promise<HttpResponse<T>> {
    const url = `${this._url}${options.path}`
    const headers: Record<string, string> = {
      apikey: this._anonKey,
    }

    // Authorization header when token provider returns an access token
    if (this._tokenProvider) {
      const token = this._tokenProvider.getAccessToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    // Content-Type on POST/PATCH when body is present
    if (
      (options.method === 'POST' || options.method === 'PATCH') &&
      options.body !== undefined
    ) {
      headers['Content-Type'] = 'application/json'
    }

    // Custom headers from constructor
    Object.assign(headers, this._customHeaders)

    // Per-request headers
    if (options.headers) {
      Object.assign(headers, options.headers)
    }

    let response: Response
    try {
      response = await globalThis.fetch(url, {
        method: options.method,
        headers,
        body: options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
      })
    } catch {
      return {
        data: null,
        error: { message: 'Network request failed' },
        status: 0,
        headers: new Headers(),
      }
    }

    const parseJson = options.parseJson !== false

    // Try to parse the response body
    let data: T | null = null
    let error: BoaError | null = null
    let body: unknown = null

    if (parseJson) {
      try {
        body = await response.json()
      } catch {
        // Body couldn't be parsed as JSON
      }
    }

    if (!response.ok) {
      error = this._parseError(body, response.status, response.statusText)

      // 401 retry logic
      if (
        response.status === 401 &&
        !_retried &&
        this._tokenProvider?.getRefreshToken()
      ) {
        const refreshResult = await this._attemptRefresh()
        if (refreshResult) {
          return this.request<T>(options, true)
        }
        return { data: null, error, status: response.status, headers: response.headers }
      }

      return { data: null, error, status: response.status, headers: response.headers }
    }

    data = body as T

    return { data, error: null, status: response.status, headers: response.headers }
  }

  private _parseError(
    body: unknown,
    status: number,
    statusText: string
  ): BoaError {
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>
      // PostgREST format: { code, message, details, hint }
      if ('code' in b && 'message' in b) {
        return {
          message: b.message as string,
          status,
          code: b.code as string,
          details: b.details as string | undefined,
          hint: b.hint as string | undefined,
        }
      }
      // GoTrue format: { error, error_description }
      if ('error' in b && 'error_description' in b) {
        return {
          message: b.error_description as string,
          status,
        }
      }
    }
    return { message: statusText, status }
  }

  private async _attemptRefresh(): Promise<boolean> {
    if (!this._tokenProvider) return false

    const refreshToken = this._tokenProvider.getRefreshToken()
    if (!refreshToken) return false

    try {
      const response = await globalThis.fetch(
        `${this._url}/auth/v1/token?grant_type=refresh_token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this._anonKey,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        }
      )

      if (response.ok) {
        const session = await response.json()
        this._tokenProvider.onRefreshSuccess(session)
        return true
      }

      this._tokenProvider.onRefreshFailure()
      return false
    } catch {
      this._tokenProvider.onRefreshFailure()
      return false
    }
  }
}

import { BoaApi } from './api.js'
import { BoaAuth } from './auth.js'
import { HttpClient } from './http.js'
import { QueryBuilder } from './query-builder.js'
import { BoaStorage } from './storage.js'
import type { BoaClientOptions } from './types.js'

export class BoaClient {
  readonly auth: BoaAuth
  readonly storage: BoaStorage
  readonly api: BoaApi
  private _http: HttpClient

  constructor(
    url: string,
    anonKey: string,
    options?: BoaClientOptions
  ) {
    if (!url) throw new Error('url is required')
    if (!anonKey) throw new Error('anonKey is required')

    const cleanUrl = url.replace(/\/+$/, '')
    this._http = new HttpClient(
      cleanUrl,
      anonKey,
      options?.headers
    )
    this.auth = new BoaAuth(
      this._http,
      options?.persistSession ?? false
    )
    this.storage = new BoaStorage(this._http)
    this.api = new BoaApi(this._http)

    this._http.setTokenProvider(this.auth)
  }

  from<T = unknown>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(this._http, table)
  }
}

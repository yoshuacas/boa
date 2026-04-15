import type { HttpClient } from './http.js'
import type { BoaError } from './types.js'

export class BoaApi {
  private _http: HttpClient

  constructor(http: HttpClient) {
    this._http = http
  }

  async getSpec(): Promise<{
    spec: object | null
    error: BoaError | null
  }> {
    throw new Error('not implemented')
  }

  // Suppress unused warnings
  private _suppress() {
    void this._http
  }
}

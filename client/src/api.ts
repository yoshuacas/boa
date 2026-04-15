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
    const { data, error } = await this._http.request<object>({
      method: 'GET',
      path: '/rest/v1/',
    })

    if (error || !data) {
      return { spec: null, error }
    }

    return { spec: data, error: null }
  }
}

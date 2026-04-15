import type { HttpClient } from './http.js'
import type {
  StorageDownloadResult,
  StorageUploadResult,
} from './types.js'

export class BoaStorage {
  private _http: HttpClient

  constructor(http: HttpClient) {
    this._http = http
  }

  async createUploadUrl(
    _params: { filename: string; contentType: string }
  ): Promise<StorageUploadResult> {
    throw new Error('not implemented')
  }

  async createDownloadUrl(
    _key: string
  ): Promise<StorageDownloadResult> {
    throw new Error('not implemented')
  }

  // Suppress unused warnings
  private _suppress() {
    void this._http
  }
}

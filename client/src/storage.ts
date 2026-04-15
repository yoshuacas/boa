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
    params: { filename: string; contentType: string }
  ): Promise<StorageUploadResult> {
    const { data, error } = await this._http.request<{
      uploadUrl: string
      key: string
      expiresIn: number
      maxSizeBytes: number
      message: string
    }>({
      method: 'POST',
      path: '/upload',
      body: {
        filename: params.filename,
        contentType: params.contentType,
      },
    })

    if (error || !data) {
      return { key: null, uploadUrl: null, error }
    }

    return {
      uploadUrl: data.uploadUrl,
      key: data.key,
      error: null,
    }
  }

  async createDownloadUrl(
    key: string
  ): Promise<StorageDownloadResult> {
    const encodedKey = encodeURIComponent(key)
    const { data, error } = await this._http.request<{
      downloadUrl: string
    }>({
      method: 'GET',
      path: `/download?key=${encodedKey}`,
    })

    if (error || !data) {
      return { downloadUrl: null, error }
    }

    return {
      downloadUrl: data.downloadUrl,
      error: null,
    }
  }
}

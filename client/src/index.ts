import { BoaClient } from './client.js'
import type { BoaClientOptions } from './types.js'

export { BoaClient } from './client.js'
export { BoaAuth } from './auth.js'
export { BoaApi } from './api.js'
export { BoaStorage } from './storage.js'
export { QueryBuilder } from './query-builder.js'
export { HttpClient } from './http.js'
export type {
  BoaClientOptions,
  Session,
  User,
  BoaError,
  AuthEvent,
  AuthListener,
  QueryResult,
  SingleResult,
  AuthResult,
  StorageUploadResult,
  StorageDownloadResult,
} from './types.js'

export function createClient(
  url: string,
  anonKey: string,
  options?: BoaClientOptions
): BoaClient {
  return new BoaClient(url, anonKey, options)
}

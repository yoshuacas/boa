export interface BoaClientOptions {
  persistSession?: boolean
  headers?: Record<string, string>
}

export interface Session {
  access_token: string
  refresh_token: string
  expires_in: number
  user: User
}

export interface User {
  id: string
  email: string
  role: string
  raw?: Record<string, unknown>
}

export interface BoaError {
  message: string
  status?: number
  code?: string
  details?: string
  hint?: string
}

export type AuthEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'

export type AuthListener = (
  event: AuthEvent,
  session: Session | null
) => void

export interface QueryResult<T> {
  data: T[] | null
  error: BoaError | null
  count: number | null
}

export interface SingleResult<T> {
  data: T | null
  error: BoaError | null
}

export interface AuthResult {
  user: User | null
  session: Session | null
  error: BoaError | null
}

export interface StorageUploadResult {
  key: string | null
  uploadUrl: string | null
  error: BoaError | null
}

export interface StorageDownloadResult {
  downloadUrl: string | null
  error: BoaError | null
}

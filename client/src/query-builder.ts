import type { HttpClient, HttpMethod } from './http.js'
import type { QueryResult } from './types.js'

export class QueryBuilder<T = unknown> {
  private _http: HttpClient
  private _table: string
  private _method: HttpMethod
  private _body: unknown | null
  private _selectColumns: string | null
  private _filters: string[]
  private _order: string | null
  private _limitVal: number | null
  private _offset: number | null
  private _count: 'exact' | null
  private _single: boolean
  private _onConflict: string | null
  private _prefer: string[]
  private _headers: Record<string, string>

  constructor(http: HttpClient, table: string) {
    this._http = http
    this._table = table
    this._method = 'GET'
    this._body = null
    this._selectColumns = null
    this._filters = []
    this._order = null
    this._limitVal = null
    this._offset = null
    this._count = null
    this._single = false
    this._onConflict = null
    this._prefer = []
    this._headers = {}
  }

  private _clone(
    overrides: Partial<{
      _method: HttpMethod
      _body: unknown | null
      _selectColumns: string | null
      _filters: string[]
      _order: string | null
      _limitVal: number | null
      _offset: number | null
      _count: 'exact' | null
      _single: boolean
      _onConflict: string | null
      _prefer: string[]
      _headers: Record<string, string>
    }>
  ): QueryBuilder<T> {
    const clone = new QueryBuilder<T>(this._http, this._table)
    clone._method = this._method
    clone._body = this._body
    clone._selectColumns = this._selectColumns
    clone._filters = [...this._filters]
    clone._order = this._order
    clone._limitVal = this._limitVal
    clone._offset = this._offset
    clone._count = this._count
    clone._single = this._single
    clone._onConflict = this._onConflict
    clone._prefer = [...this._prefer]
    clone._headers = { ...this._headers }
    Object.assign(clone, overrides)
    return clone
  }

  // --- Mutation methods ---

  select(
    columns?: string,
    options?: { count?: 'exact' }
  ): QueryBuilder<T> {
    const overrides: Parameters<typeof this._clone>[0] = {
      _method: 'GET' as const,
      _selectColumns: columns ?? '*',
    }
    if (options?.count === 'exact') {
      overrides._count = 'exact'
    }
    return this._clone(overrides)
  }

  insert(data: Partial<T> | Partial<T>[]): QueryBuilder<T> {
    return this._clone({
      _method: 'POST',
      _body: data,
      _prefer: [...this._prefer, 'return=representation'],
    })
  }

  update(data: Partial<T>): QueryBuilder<T> {
    return this._clone({
      _method: 'PATCH',
      _body: data,
      _prefer: [...this._prefer, 'return=representation'],
    })
  }

  delete(): QueryBuilder<T> {
    return this._clone({
      _method: 'DELETE',
    })
  }

  upsert(
    data: Partial<T> | Partial<T>[],
    options?: { onConflict?: string }
  ): QueryBuilder<T> {
    return this._clone({
      _method: 'POST',
      _body: data,
      _onConflict: options?.onConflict ?? null,
      _prefer: [
        ...this._prefer,
        'resolution=merge-duplicates',
        'return=representation',
      ],
    })
  }

  // --- Filter methods ---

  eq(column: string, value: unknown): QueryBuilder<T> {
    return this._clone({
      _filters: [...this._filters, `${column}=eq.${value}`],
    })
  }

  neq(column: string, value: unknown): QueryBuilder<T> {
    return this._clone({
      _filters: [...this._filters, `${column}=neq.${value}`],
    })
  }

  gt(column: string, value: unknown): QueryBuilder<T> {
    return this._clone({
      _filters: [...this._filters, `${column}=gt.${value}`],
    })
  }

  gte(column: string, value: unknown): QueryBuilder<T> {
    return this._clone({
      _filters: [...this._filters, `${column}=gte.${value}`],
    })
  }

  lt(column: string, value: unknown): QueryBuilder<T> {
    return this._clone({
      _filters: [...this._filters, `${column}=lt.${value}`],
    })
  }

  lte(column: string, value: unknown): QueryBuilder<T> {
    return this._clone({
      _filters: [...this._filters, `${column}=lte.${value}`],
    })
  }

  like(column: string, pattern: string): QueryBuilder<T> {
    return this._clone({
      _filters: [...this._filters, `${column}=like.${pattern}`],
    })
  }

  ilike(column: string, pattern: string): QueryBuilder<T> {
    return this._clone({
      _filters: [...this._filters, `${column}=ilike.${pattern}`],
    })
  }

  in(column: string, values: unknown[]): QueryBuilder<T> {
    const formatted = `${column}=in.(${values.join(',')})`
    return this._clone({
      _filters: [...this._filters, formatted],
    })
  }

  is(column: string, value: null | boolean): QueryBuilder<T> {
    const strVal = value === null ? 'null' : String(value)
    return this._clone({
      _filters: [...this._filters, `${column}=is.${strVal}`],
    })
  }

  not(
    column: string,
    operator: string,
    value: unknown
  ): QueryBuilder<T> {
    return this._clone({
      _filters: [
        ...this._filters,
        `${column}=not.${operator}.${value}`,
      ],
    })
  }

  // --- Modifier methods ---

  order(
    column: string,
    options?: { ascending?: boolean }
  ): QueryBuilder<T> {
    const direction =
      options?.ascending === false ? 'desc' : 'asc'
    return this._clone({
      _order: `${column}.${direction}`,
    })
  }

  limit(count: number): QueryBuilder<T> {
    return this._clone({
      _limitVal: count,
    })
  }

  range(from: number, to: number): QueryBuilder<T> {
    return this._clone({
      _limitVal: to - from + 1,
      _offset: from,
    })
  }

  single(): QueryBuilder<T> {
    return this._clone({
      _single: true,
    })
  }

  // --- URL and header construction ---

  _buildUrl(): string {
    const parts: string[] = []

    if (this._selectColumns !== null) {
      parts.push(`select=${this._selectColumns}`)
    }

    for (const filter of this._filters) {
      parts.push(filter)
    }

    if (this._order !== null) {
      parts.push(`order=${this._order}`)
    }

    if (this._limitVal !== null) {
      parts.push(`limit=${this._limitVal}`)
    }

    if (this._offset !== null) {
      parts.push(`offset=${this._offset}`)
    }

    if (this._onConflict !== null) {
      parts.push(`on_conflict=${this._onConflict}`)
    }

    const qs = parts.length > 0 ? `?${parts.join('&')}` : ''
    return `/rest/v1/${this._table}${qs}`
  }

  _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this._headers,
    }

    const preferParts = [...this._prefer]
    if (this._count === 'exact') {
      preferParts.push('count=exact')
    }
    if (preferParts.length > 0) {
      headers['Prefer'] = preferParts.join(',')
    }

    if (this._single) {
      headers['Accept'] = 'application/vnd.pgrst.object+json'
    }

    return headers
  }

  _getMethod(): HttpMethod {
    return this._method
  }

  _getBody(): unknown | null {
    return this._body
  }

  // --- Execution ---

  private async _execute(): Promise<QueryResult<T>> {
    const url = this._buildUrl()
    const headers = this._buildHeaders()

    const response = await this._http.request<T[]>({
      method: this._method,
      path: url,
      body: this._body ?? undefined,
      headers,
    })

    if (response.error) {
      return { data: null, error: response.error, count: null }
    }

    let count: number | null = null
    const contentRange = response.headers.get('Content-Range')
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/)
      if (match) {
        count = parseInt(match[1], 10)
      }
    }

    return {
      data: response.data,
      error: null,
      count,
    }
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled, onrejected)
  }
}

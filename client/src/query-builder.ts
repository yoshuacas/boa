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

  select(
    _columns?: string,
    _options?: { count?: 'exact' }
  ): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  insert(_data: Partial<T> | Partial<T>[]): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  update(_data: Partial<T>): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  delete(): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  upsert(
    _data: Partial<T> | Partial<T>[],
    _options?: { onConflict?: string }
  ): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  eq(_column: string, _value: unknown): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  neq(_column: string, _value: unknown): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  gt(_column: string, _value: unknown): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  gte(_column: string, _value: unknown): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  lt(_column: string, _value: unknown): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  lte(_column: string, _value: unknown): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  like(_column: string, _pattern: string): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  ilike(_column: string, _pattern: string): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  in(_column: string, _values: unknown[]): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  is(_column: string, _value: null | boolean): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  not(
    _column: string,
    _operator: string,
    _value: unknown
  ): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  order(
    _column: string,
    _options?: { ascending?: boolean }
  ): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  limit(_count: number): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  range(_from: number, _to: number): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  single(): QueryBuilder<T> {
    throw new Error('not implemented')
  }

  _buildUrl(): string {
    throw new Error('not implemented')
  }

  _buildHeaders(): Record<string, string> {
    throw new Error('not implemented')
  }

  _getMethod(): HttpMethod {
    return this._method
  }

  _getBody(): unknown | null {
    return this._body
  }

  private async _execute(): Promise<QueryResult<T>> {
    throw new Error('not implemented')
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

  // Suppress unused warnings
  private _suppress() {
    void this._clone
  }
}

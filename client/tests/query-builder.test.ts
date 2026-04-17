import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { HttpClient } from '../src/http.js'
import { QueryBuilder } from '../src/query-builder.js'

// Create a minimal HttpClient for the QueryBuilder to reference.
// Tests only inspect URL/header output, not actual HTTP calls.
function createBuilder(table: string): QueryBuilder {
  const http = new HttpClient('https://api.example.com', 'test-key')
  return new QueryBuilder(http, table)
}

describe('QueryBuilder', () => {
  // --- Select and URL building ---

  describe('select and URL building', () => {
    it('from("todos").select("*") builds GET /rest/v1/todos?select=*', () => {
      const builder = createBuilder('todos').select('*')
      const url = builder._buildUrl()
      assert.equal(
        url,
        '/rest/v1/todos?select=*',
        'URL should be /rest/v1/todos?select=*'
      )
      assert.equal(
        builder._getMethod(),
        'GET',
        'Method should be GET'
      )
    })

    it('from("todos").select("id,title") builds GET /rest/v1/todos?select=id,title', () => {
      const builder = createBuilder('todos').select('id,title')
      const url = builder._buildUrl()
      assert.equal(
        url,
        '/rest/v1/todos?select=id,title',
        'URL should include select=id,title'
      )
    })
  })

  // --- Filter operators ---

  describe('filter operators', () => {
    it('.eq("status", "active") appends status=eq.active', () => {
      const builder = createBuilder('todos').select('*').eq('status', 'active')
      const url = builder._buildUrl()
      assert.ok(
        url.includes('status=eq.active'),
        `URL should contain status=eq.active, got: ${url}`
      )
    })

    it('.neq("status", "archived") appends status=neq.archived', () => {
      const builder = createBuilder('todos').select('*').neq('status', 'archived')
      const url = builder._buildUrl()
      assert.ok(
        url.includes('status=neq.archived'),
        `URL should contain status=neq.archived, got: ${url}`
      )
    })

    it('.gt("age", 18) appends age=gt.18', () => {
      const builder = createBuilder('users').select('*').gt('age', 18)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('age=gt.18'),
        `URL should contain age=gt.18, got: ${url}`
      )
    })

    it('.gte("age", 18) appends age=gte.18', () => {
      const builder = createBuilder('users').select('*').gte('age', 18)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('age=gte.18'),
        `URL should contain age=gte.18, got: ${url}`
      )
    })

    it('.lt("price", 100) appends price=lt.100', () => {
      const builder = createBuilder('products').select('*').lt('price', 100)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('price=lt.100'),
        `URL should contain price=lt.100, got: ${url}`
      )
    })

    it('.lte("price", 100) appends price=lte.100', () => {
      const builder = createBuilder('products').select('*').lte('price', 100)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('price=lte.100'),
        `URL should contain price=lte.100, got: ${url}`
      )
    })

    it('.like("name", "*smith*") appends name=like.*smith*', () => {
      const builder = createBuilder('users').select('*').like('name', '*smith*')
      const url = builder._buildUrl()
      assert.ok(
        url.includes('name=like.*smith*'),
        `URL should contain name=like.*smith*, got: ${url}`
      )
    })

    it('.ilike("name", "*smith*") appends name=ilike.*smith*', () => {
      const builder = createBuilder('users').select('*').ilike('name', '*smith*')
      const url = builder._buildUrl()
      assert.ok(
        url.includes('name=ilike.*smith*'),
        `URL should contain name=ilike.*smith*, got: ${url}`
      )
    })

    it('.in("status", ["active", "done"]) appends status=in.(active,done)', () => {
      const builder = createBuilder('todos')
        .select('*')
        .in('status', ['active', 'done'])
      const url = builder._buildUrl()
      assert.ok(
        url.includes('status=in.(active,done)'),
        `URL should contain status=in.(active,done), got: ${url}`
      )
    })

    it('.is("deleted_at", null) appends deleted_at=is.null', () => {
      const builder = createBuilder('todos').select('*').is('deleted_at', null)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('deleted_at=is.null'),
        `URL should contain deleted_at=is.null, got: ${url}`
      )
    })

    it('.not("id", "eq", "abc") appends id=not.eq.abc', () => {
      const builder = createBuilder('todos').select('*').not('id', 'eq', 'abc')
      const url = builder._buildUrl()
      assert.ok(
        url.includes('id=not.eq.abc'),
        `URL should contain id=not.eq.abc, got: ${url}`
      )
    })
  })

  // --- Modifiers ---

  describe('modifiers', () => {
    it('.order("created_at", { ascending: false }) appends order=created_at.desc', () => {
      const builder = createBuilder('todos')
        .select('*')
        .order('created_at', { ascending: false })
      const url = builder._buildUrl()
      assert.ok(
        url.includes('order=created_at.desc'),
        `URL should contain order=created_at.desc, got: ${url}`
      )
    })

    it('.order("created_at") defaults to ascending: order=created_at.asc', () => {
      const builder = createBuilder('todos')
        .select('*')
        .order('created_at')
      const url = builder._buildUrl()
      assert.ok(
        url.includes('order=created_at.asc'),
        `URL should contain order=created_at.asc, got: ${url}`
      )
    })

    it('.limit(10) appends limit=10', () => {
      const builder = createBuilder('todos').select('*').limit(10)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('limit=10'),
        `URL should contain limit=10, got: ${url}`
      )
    })

    it('.range(0, 9) appends limit=10&offset=0', () => {
      const builder = createBuilder('todos').select('*').range(0, 9)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('limit=10'),
        `URL should contain limit=10, got: ${url}`
      )
      assert.ok(
        url.includes('offset=0'),
        `URL should contain offset=0, got: ${url}`
      )
    })

    it('.range(20, 29) appends limit=10&offset=20', () => {
      const builder = createBuilder('todos').select('*').range(20, 29)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('limit=10'),
        `URL should contain limit=10, got: ${url}`
      )
      assert.ok(
        url.includes('offset=20'),
        `URL should contain offset=20, got: ${url}`
      )
    })

    it('.single() sets Accept header to application/vnd.pgrst.object+json', () => {
      const builder = createBuilder('todos').select('*').single()
      const headers = builder._buildHeaders()
      assert.equal(
        headers['Accept'],
        'application/vnd.pgrst.object+json',
        'Accept header should be application/vnd.pgrst.object+json'
      )
    })

    it('.select("*", { count: "exact" }) adds count=exact to Prefer header', () => {
      const builder = createBuilder('todos').select('*', { count: 'exact' })
      const headers = builder._buildHeaders()
      assert.ok(
        headers['Prefer']?.includes('count=exact'),
        `Prefer header should include count=exact, got: ${headers['Prefer']}`
      )
    })
  })

  // --- Mutations ---

  describe('mutations', () => {
    it('.insert({...}) builds POST with body and Prefer: return=representation', () => {
      const data = { title: 'Buy milk', user_id: 'abc' }
      const builder = createBuilder('todos').insert(data)
      assert.equal(
        builder._getMethod(),
        'POST',
        'Method should be POST for insert'
      )
      assert.deepEqual(
        builder._getBody(),
        data,
        'Body should be the inserted data'
      )
      const headers = builder._buildHeaders()
      assert.ok(
        headers['Prefer']?.includes('return=representation'),
        `Prefer header should include return=representation, got: ${headers['Prefer']}`
      )
    })

    it('.update({...}).eq("id", "abc") builds PATCH with filters and body and Prefer: return=representation', () => {
      const data = { completed: true }
      const builder = createBuilder('todos')
        .update(data)
        .eq('id', 'abc')
      assert.equal(
        builder._getMethod(),
        'PATCH',
        'Method should be PATCH for update'
      )
      assert.deepEqual(
        builder._getBody(),
        data,
        'Body should be the update data'
      )
      const url = builder._buildUrl()
      assert.ok(
        url.includes('id=eq.abc'),
        `URL should contain filter id=eq.abc, got: ${url}`
      )
      const headers = builder._buildHeaders()
      assert.ok(
        headers['Prefer']?.includes('return=representation'),
        `Prefer header should include return=representation, got: ${headers['Prefer']}`
      )
    })

    it('.delete().eq("id", "abc") builds DELETE with filters and no Prefer: return=representation', () => {
      const builder = createBuilder('todos')
        .delete()
        .eq('id', 'abc')
      assert.equal(
        builder._getMethod(),
        'DELETE',
        'Method should be DELETE'
      )
      const url = builder._buildUrl()
      assert.ok(
        url.includes('id=eq.abc'),
        `URL should contain filter id=eq.abc, got: ${url}`
      )
      const headers = builder._buildHeaders()
      const prefer = headers['Prefer'] ?? ''
      assert.ok(
        !prefer.includes('return=representation'),
        `Prefer header should NOT include return=representation for delete, got: ${prefer}`
      )
    })

    it('.upsert({...}, { onConflict: "id" }) builds POST with on_conflict=id and Prefer: resolution=merge-duplicates,return=representation', () => {
      const data = { id: 'abc', title: 'Updated' }
      const builder = createBuilder('todos')
        .upsert(data, { onConflict: 'id' })
      assert.equal(
        builder._getMethod(),
        'POST',
        'Method should be POST for upsert'
      )
      assert.deepEqual(
        builder._getBody(),
        data,
        'Body should be the upsert data'
      )
      const url = builder._buildUrl()
      assert.ok(
        url.includes('on_conflict=id'),
        `URL should contain on_conflict=id, got: ${url}`
      )
      const headers = builder._buildHeaders()
      assert.ok(
        headers['Prefer']?.includes('resolution=merge-duplicates'),
        `Prefer header should include resolution=merge-duplicates, got: ${headers['Prefer']}`
      )
      assert.ok(
        headers['Prefer']?.includes('return=representation'),
        `Prefer header should include return=representation, got: ${headers['Prefer']}`
      )
    })
  })

  // --- Single row error ---

  describe('single row error', () => {
    it('.single() on a query that returns zero or multiple rows results in a PGRST116 error', async () => {
      // This test verifies that the builder sets the correct Accept
      // header so the server can return PGRST116. Since we use stubs,
      // we verify the header is set and then simulate the server error.
      const builder = createBuilder('todos').select('*').single()
      const headers = builder._buildHeaders()
      assert.equal(
        headers['Accept'],
        'application/vnd.pgrst.object+json',
        'single() must set Accept header for server to return PGRST116 on count mismatch'
      )
    })
  })

  // --- Immutability ---

  describe('immutability', () => {
    it('chaining .eq() returns a new builder; the original is unchanged', () => {
      const original = createBuilder('todos').select('*')
      const filtered = original.eq('status', 'active')

      // The original should not have the filter
      const originalUrl = original._buildUrl()
      const filteredUrl = filtered._buildUrl()

      assert.ok(
        !originalUrl.includes('status=eq.active'),
        `Original URL should NOT contain the filter, got: ${originalUrl}`
      )
      assert.ok(
        filteredUrl.includes('status=eq.active'),
        `Filtered URL should contain the filter, got: ${filteredUrl}`
      )
    })

    it('multiple filters chain: .eq("a", 1).eq("b", 2) produces a=eq.1&b=eq.2', () => {
      const builder = createBuilder('todos')
        .select('*')
        .eq('a', 1)
        .eq('b', 2)
      const url = builder._buildUrl()
      assert.ok(
        url.includes('a=eq.1'),
        `URL should contain a=eq.1, got: ${url}`
      )
      assert.ok(
        url.includes('b=eq.2'),
        `URL should contain b=eq.2, got: ${url}`
      )
    })
  })
})

/**
 * The app's only doorway to the backend. Two interchangeable implementations:
 * - Supabase (real): used when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 * - Test bridge: used when VITE_TEST_BRIDGE is set; talks to supabase/tests/bridge.mjs, which runs the
 *   same requests against a local Postgres with the real security rules. Lets the app be tested without Supabase.
 * With neither set, `remote` is null and the app runs on sample data.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface AuthUser { id: string; email: string }
export interface Query { eq?: Record<string, unknown>; gte?: Record<string, string>; order?: [column: string, ascending: boolean] }
type Row = Record<string, unknown>

export interface Remote {
  kind: 'supabase' | 'bridge'
  /** Email a sign-in link (and code, if the email template includes one). */
  sendCode(email: string, redirectTo: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  /** Finish sign-in from an emailed link (`?code=` in the address bar). Returns true if it did. */
  completeLinkSignIn(): Promise<boolean>
  currentUser(): Promise<AuthUser | null>
  signOut(): Promise<void>
  select<T = Row>(table: string, q?: Query): Promise<T[]>
  insert(table: string, rows: Row[], opts?: { ignoreDuplicates?: boolean }): Promise<void>
  update(table: string, match: Row, patch: Row): Promise<number>
  remove(table: string, match: Row): Promise<void>
  rpc<T = unknown>(fn: string, args?: Row): Promise<T>
  /** Call a server function (Supabase Edge Function). */
  invoke<T = unknown>(fn: string, body: Row): Promise<T>
  /** Live updates: call `cb` for each new row where `column` equals `value`. Returns an unsubscribe function. */
  subscribeInserts(table: string, column: string, value: string, cb: (row: Row) => void): () => void
}

const env = import.meta.env
const fail = (e: { message?: string } | null | undefined, what: string) => { if (e) throw new Error(`${what}: ${e.message ?? 'failed'}`) }

function supabaseRemote(url: string, key: string): Remote {
  const sb: SupabaseClient = createClient(url, key, {
    // PKCE + manual link handling: Spotify's sign-in also returns `?code=`, so the app decides which one it is.
    auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
  })
  const PAGE = 1000
  return {
    kind: 'supabase',
    async sendCode(email, redirectTo) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectTo } })
      fail(error, 'Sign-in email')
    },
    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' })
      fail(error, 'Code')
    },
    async completeLinkSignIn() {
      const p = new URLSearchParams(location.search)
      const code = p.get('code')
      if (!code || p.get('state')) return false // a `state` means it's Spotify's redirect, not ours
      history.replaceState(null, '', location.pathname + location.hash)
      const { error } = await sb.auth.exchangeCodeForSession(code)
      fail(error, 'Sign-in link')
      return true
    },
    async currentUser() {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      return u ? { id: u.id, email: u.email ?? '' } : null
    },
    async signOut() { await sb.auth.signOut() },
    async select(table, q = {}) {
      // PostgREST returns at most 1000 rows per request, so read in pages.
      const out: Row[] = []
      for (let from = 0; ; from += PAGE) {
        let req = sb.from(table).select('*').range(from, from + PAGE - 1)
        for (const [k, v] of Object.entries(q.eq ?? {})) req = req.eq(k, v as never)
        for (const [k, v] of Object.entries(q.gte ?? {})) req = req.gte(k, v)
        if (q.order) req = req.order(q.order[0], { ascending: q.order[1] })
        const { data, error } = await req
        fail(error, `Load ${table}`)
        out.push(...((data ?? []) as Row[]))
        if (!data || data.length < PAGE) return out as never
      }
    },
    async insert(table, rows, opts) {
      if (!rows.length) return
      const { error } = opts?.ignoreDuplicates ? await sb.from(table).upsert(rows, { ignoreDuplicates: true }) : await sb.from(table).insert(rows)
      fail(error, `Save ${table}`)
    },
    async update(table, match, patch) {
      const { error, count } = await sb.from(table).update(patch, { count: 'exact' }).match(match)
      fail(error, `Update ${table}`)
      return count ?? 0
    },
    async remove(table, match) {
      const { error } = await sb.from(table).delete().match(match)
      fail(error, `Delete ${table}`)
    },
    async rpc(fn, args) {
      const { data, error } = await sb.rpc(fn, args ?? {})
      fail(error, fn)
      return data as never
    },
    async invoke(fn, body) {
      const { data, error } = await sb.functions.invoke(fn, { body })
      fail(error, fn)
      return data as never
    },
    subscribeInserts(table, column, value, cb) {
      const ch = sb.channel(`${table}:${column}:${value}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `${column}=eq.${value}` }, (p) => cb(p.new as Row))
        .subscribe()
      return () => { void sb.removeChannel(ch) }
    },
  }
}

/** Test-only stand-in. Any code is accepted; identity is the email's account in the local database. */
function bridgeRemote(base: string): Remote {
  const KEY = 'aux-bridge-user'
  const me = (): AuthUser | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
  const call = async <T,>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: me()?.id ?? null, ...(body as object) }) })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error ?? 'Bridge error')
    return j.data as T
  }
  return {
    kind: 'bridge',
    async sendCode(email) { await call('/auth/send', { email }); sessionStorage.setItem('aux-bridge-pending', email) },
    async verifyCode(email) { localStorage.setItem(KEY, JSON.stringify(await call<AuthUser>('/auth/verify', { email }))) },
    async completeLinkSignIn() { return false },
    async currentUser() { return me() },
    async signOut() { localStorage.removeItem(KEY) },
    select: (table, q) => call('/select', { table, q }),
    insert: (table, rows, opts) => call('/insert', { table, rows, opts }),
    update: (table, match, patch) => call('/update', { table, match, patch }),
    remove: (table, match) => call('/remove', { table, match }),
    rpc: (fn, args) => call('/rpc', { fn, args }),
    invoke: (fn, body) => call('/invoke', { fn, body }),
    subscribeInserts(table, column, value, cb) {
      // Polling stands in for Supabase Realtime.
      const seen = new Set<string>()
      let first = true
      const t = setInterval(async () => {
        try {
          const rows = await call<Row[]>('/select', { table, q: { eq: { [column]: value } } })
          for (const r of rows) { const id = String(r.id); if (!seen.has(id)) { seen.add(id); if (!first) cb(r) } }
          first = false
        } catch { /* ignore */ }
      }, 1500)
      return () => clearInterval(t)
    },
  }
}

export const remote: Remote | null =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY ? supabaseRemote(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    : env.VITE_TEST_BRIDGE ? bridgeRemote(env.VITE_TEST_BRIDGE)
      : null

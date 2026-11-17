// Test bridge: a tiny HTTP server that stands in for Supabase so the app can be tested against a local
// Postgres with the real security rules (every request runs as the signed-in student, RLS enforced).
//   DATABASE_URL=postgres://… node supabase/tests/bridge.mjs [--reset] [--port 8787]
// Then build the app with VITE_TEST_BRIDGE=http://127.0.0.1:8787. Never use this in production.
import http from 'node:http'
import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'

const args = process.argv.slice(2)
const port = Number(args[args.indexOf('--port') + 1]) || 8787
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const dir = new URL('../', import.meta.url)

/** Stand-ins for Supabase Edge Functions: name -> async ({ uid, body, asUser }) => result. */
export const functions = {}

export async function resetDatabase() {
  const c = await pool.connect()
  try {
    await c.query('drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;')
    await c.query(readFileSync(new URL('tests/stub_supabase.sql', dir), 'utf8'))
    for (const f of readdirSync(new URL('migrations/', dir)).sort()) await c.query(readFileSync(new URL('migrations/' + f, dir), 'utf8'))
  } finally { c.release() }
}

const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('bad identifier ' + s); return `"${s}"` }

/** Run fn inside a transaction as the given student, or as the server (RLS bypassed) when uid is 'service'. */
export async function asUser(uid, fn) {
  const c = await pool.connect()
  try {
    await c.query('begin')
    if (uid !== 'service') {
      await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`)
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    }
    const out = await fn(c)
    await c.query('commit')
    return out
  } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
}

const where = (match, params) => {
  const parts = Object.entries(match ?? {}).map(([k, v]) => {
    if (v === null) return `${ident(k)} is null`
    params.push(v)
    return `${ident(k)} = $${params.length}`
  })
  return parts.length ? ' where ' + parts.join(' and ') : ''
}

const handlers = {
  '/auth/send': async ({ email }) => {
    const e = String(email).toLowerCase()
    const found = await pool.query('select id from auth.users where lower(email) = $1', [e])
    if (!found.rowCount) await pool.query('insert into auth.users (email) values ($1)', [e]) // school-email trigger applies
    return null
  },
  '/auth/verify': async ({ email }) => {
    const r = await pool.query('select id, email from auth.users where lower(email) = $1', [String(email).toLowerCase()])
    if (!r.rowCount) throw new Error('No sign-in requested for that email')
    return r.rows[0]
  },
  '/select': ({ uid, table, q = {} }) => asUser(uid, async (c) => {
    const params = []
    let sql = `select * from public.${ident(table)}` + where(q.eq, params)
    for (const [k, v] of Object.entries(q.gte ?? {})) {
      params.push(v)
      sql += (params.length > 1 || sql.includes(' where ') ? ' and ' : ' where ') + `${ident(k)} >= $${params.length}`
    }
    if (q.order) sql += ` order by ${ident(q.order[0])} ${q.order[1] ? 'asc' : 'desc'}`
    return (await c.query(sql, params)).rows
  }),
  '/insert': ({ uid, table, rows, opts }) => asUser(uid, async (c) => {
    for (const row of rows) {
      const cols = Object.keys(row)
      await c.query(
        `insert into public.${ident(table)} (${cols.map(ident).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})${opts?.ignoreDuplicates ? ' on conflict do nothing' : ''}`,
        cols.map((k) => row[k]),
      )
    }
    return null
  }),
  '/update': ({ uid, table, match, patch }) => asUser(uid, async (c) => {
    const params = []
    const sets = Object.entries(patch).map(([k, v]) => { params.push(v); return `${ident(k)} = $${params.length}` })
    return (await c.query(`update public.${ident(table)} set ${sets.join(', ')}` + where(match, params), params)).rowCount
  }),
  '/remove': ({ uid, table, match }) => asUser(uid, async (c) => {
    const params = []
    await c.query(`delete from public.${ident(table)}` + where(match, params), params)
    return null
  }),
  '/rpc': ({ uid, fn, args = {} }) => asUser(uid, async (c) => {
    const meta = (await c.query(`select proretset, prorettype::regtype::text t from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace limit 1`, [fn])).rows[0]
    if (!meta) throw new Error('No function ' + fn)
    const keys = Object.keys(args)
    const r = await c.query(`select * from public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`, keys.map((k) => args[k]))
    return meta.proretset ? r.rows : meta.t === 'void' ? null : r.rows[0]?.[fn] ?? null
  }),
  '/invoke': async ({ uid, fn, body }) => {
    if (!functions[fn]) throw new Error('No server function ' + fn)
    return functions[fn]({ uid, body, asUser })
  },
}

export const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') return res.end()
  let raw = ''
  for await (const chunk of req) raw += chunk
  res.setHeader('Content-Type', 'application/json')
  try {
    const h = handlers[req.url]
    if (!h) throw new Error('Unknown route ' + req.url)
    res.end(JSON.stringify({ data: await h(raw ? JSON.parse(raw) : {}) }))
  } catch (e) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: e.message }))
  }
})

// Run directly: start listening (optionally rebuilding the database first).
// --functions also serves the Spotify and Last.fm server functions against stand-in services (needs
// `node --experimental-strip-types`, since the functions are TypeScript).
if (import.meta.url === `file://${process.argv[1]}`) {
  if (args.includes('--reset')) await resetDatabase()
  if (args.includes('--functions')) {
    const { spotifyAction, lastfmAction } = await import('../functions/_shared/handlers.ts')
    const { createSpotify } = await import('../functions/_shared/spotify.ts')
    const { createLastfm } = await import('../functions/_shared/lastfm.ts')
    const { pgDb } = await import('./pgdb.mjs')
    const { FAKE, fakeFetch } = await import('./fakes.mjs')
    const spotify = createSpotify({ clientId: FAKE.spotifyId, clientSecret: FAKE.spotifySecret, fetch: fakeFetch() })
    const lastfm = createLastfm({ apiKey: FAKE.lastfmKey, sharedSecret: FAKE.lastfmSecret, fetch: fakeFetch() })
    const signedIn = (uid) => { if (!uid) throw new Error('Sign in first.'); return uid }
    functions.spotify = ({ uid, body, asUser }) => { signedIn(uid); return spotifyAction(body, { db: pgDb(asUser), spotify }) }
    functions.lastfm = ({ uid, body, asUser }) => lastfmAction(body, { uid: signedIn(uid), db: pgDb(asUser), lastfm, spotify })
  }
  server.listen(port, '127.0.0.1', () => console.log(`bridge on http://127.0.0.1:${port}`))
}

// Last.fm API: sign-in (proves a student owns the account) and reading their recent plays.
// Signing needs the shared secret, so this only runs on the server.
import { md5 } from './md5.ts'

type Fetch = typeof fetch
export interface Scrobble { title: string; artist: string; album: string; playedAt: number | null; nowPlaying: boolean }

export function createLastfm(opts: { apiKey: string; sharedSecret: string; fetch?: Fetch; apiBase?: string }) {
  const f = opts.fetch ?? fetch
  const base = opts.apiBase ?? 'https://ws.audioscrobbler.com/2.0/'

  /** Last.fm's signature: md5 of every parameter (except format) sorted by name as name+value, then the secret. */
  const sign = (params: Record<string, string>) =>
    md5(Object.keys(params).filter((k) => k !== 'format').sort().map((k) => k + params[k]).join('') + opts.sharedSecret)

  async function call(params: Record<string, string>, signed = false) {
    const p: Record<string, string> = { ...params, api_key: opts.apiKey }
    if (signed) p.api_sig = sign(p)
    p.format = 'json'
    const res = await f(base + '?' + new URLSearchParams(p), { headers: { 'User-Agent': 'Aux/1.0' } })
    const j = await res.json().catch(() => null)
    if (!res.ok || j?.error) throw new Error(`Last.fm: ${j?.message ?? res.status}`)
    return j
  }

  return {
    sign,
    /** Exchange the one-time token from Last.fm's sign-in page for the account's username. */
    async usernameFromToken(token: string): Promise<string> {
      const j = await call({ method: 'auth.getSession', token }, true)
      const name = j?.session?.name
      if (!name) throw new Error('Last.fm sign-in didn’t return an account')
      return name
    },
    /** Recent plays, newest first. `fromSec`: only plays after this Unix time. Up to `pages` × 200 plays. */
    async recent(user: string, fromSec?: number, pages = 3): Promise<Scrobble[]> {
      const out: Scrobble[] = []
      for (let page = 1; page <= pages; page++) {
        const params: Record<string, string> = { method: 'user.getrecenttracks', user, limit: '200', page: String(page) }
        if (fromSec) params.from = String(fromSec + 1)
        const j = await call(params)
        const items = j?.recenttracks?.track ?? []
        for (const t of Array.isArray(items) ? items : [items]) {
          out.push({
            title: t.name, artist: t.artist?.['#text'] ?? t.artist?.name ?? '', album: t.album?.['#text'] ?? '',
            playedAt: t.date?.uts ? Number(t.date.uts) * 1000 : null, nowPlaying: t['@attr']?.nowplaying === 'true',
          })
        }
        const total = Number(j?.recenttracks?.['@attr']?.totalPages ?? 1)
        if (page >= total) break
      }
      return out
    },
  }
}
export type Lastfm = ReturnType<typeof createLastfm>

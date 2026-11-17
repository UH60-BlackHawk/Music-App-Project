// Spotify Web API with the app-only "client credentials" flow: no student signs in, so it isn't limited
// by Development Mode's 5-user cap. Needs the client secret, so it only ever runs on the server.
import { mapGenre } from './music.ts'

type Fetch = typeof fetch
export interface SpTrack { id: string; name: string; duration_ms: number; artists: { id: string; name: string }[]; album: { id: string; name: string; release_date?: string } }

export function createSpotify(opts: { clientId: string; clientSecret: string; fetch?: Fetch; accountsBase?: string; apiBase?: string }) {
  const f = opts.fetch ?? fetch
  const accounts = opts.accountsBase ?? 'https://accounts.spotify.com'
  const api = opts.apiBase ?? 'https://api.spotify.com/v1'
  let token: { value: string; exp: number } | null = null

  async function getToken() {
    if (token && Date.now() < token.exp) return token.value
    const res = await f(`${accounts}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${opts.clientId}:${opts.clientSecret}`) },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) throw new Error(`Spotify token ${res.status}`)
    const j = await res.json()
    token = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }
    return token.value
  }
  async function get(path: string) {
    const res = await f(api + path, { headers: { Authorization: `Bearer ${await getToken()}` } })
    if (res.status === 429) throw new Error('Spotify is busy right now. Try again in a minute.')
    if (!res.ok) throw new Error(`Spotify ${res.status}`)
    return res.json()
  }

  return {
    async search(q: string, limit = 10): Promise<SpTrack[]> {
      const j = await get(`/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`)
      return (j?.tracks?.items ?? []).filter((t: SpTrack | null) => t?.id)
    },
    async track(id: string): Promise<SpTrack | null> {
      if (!/^[A-Za-z0-9]{10,30}$/.test(id)) return null
      return get(`/tracks/${id}`).catch(() => null)
    },
    /** Aux genre for each artist id (looked up in batches of 50). */
    async genres(artistIds: string[]): Promise<Record<string, string>> {
      const out: Record<string, string> = {}
      const ids = [...new Set(artistIds)]
      for (let i = 0; i < ids.length; i += 50) {
        const j = await get(`/artists?ids=${ids.slice(i, i + 50).join(',')}`).catch(() => null)
        for (const a of j?.artists ?? []) if (a) out[a.id] = mapGenre(a.genres)
      }
      return out
    },
  }
}
export type Spotify = ReturnType<typeof createSpotify>

/** Pull a Spotify track id out of a pasted link or URI (open.spotify.com/track/…, spotify:track:…, with or without ?si=). */
export function spotifyIdFromLink(text: string): string | null {
  const m = text.trim().match(/(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/|spotify:track:)([A-Za-z0-9]{10,30})/)
  return m ? m[1] : null
}

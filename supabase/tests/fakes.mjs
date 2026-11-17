// Stand-ins for the Spotify and Last.fm APIs, for tests. `fakeFetch` answers like the real services for the
// requests Aux makes, checks credentials and Last.fm's request signature, and records every call.
import { md5 } from '../functions/_shared/md5.ts'

export const FAKE = { spotifyId: 'test-client', spotifySecret: 'test-secret', lastfmKey: 'test-lastfm-key', lastfmSecret: 'test-lastfm-secret', lastfmToken: 'a'.repeat(32), lastfmUser: 'maya_fm' }

const T = (id, name, artist, artistId, album, albumId, ms, rel = '2024-05-01') => ({ id, name, duration_ms: ms, artists: [{ id: artistId, name: artist }], album: { id: albumId, name: album, release_date: rel } })
export const SP_TRACKS = [
  T('6dOtVTDdiauQNBQEDOtlAB', 'Espresso', 'Sabrina Carpenter', 'spA1', "Short n' Sweet", 'spB1', 175000),
  T('1BxfuPKGuaTgP7aM0Bbdwr', 'Cruel Summer', 'Taylor Swift', 'spA2', 'Lover', 'spB2', 178000, '2019-08-23'),
  T('4xqrdfXkTW4T0RauPLv3WA', 'From The Start', 'Laufey', 'spA3', 'Bewitched', 'spB3', 169000, '2023-09-08'),
  T('2nLtzopw4rPReszdYBJU6h', 'Good Luck, Babe!', 'Chappell Roan', 'spA4', 'Good Luck, Babe!', 'spB4', 218000),
  T('6AI3ezQ4o3HUoP6Dhudph3', 'Not Like Us', 'Kendrick Lamar', 'spA5', 'Not Like Us', 'spB5', 274000),
  T('2plbrEY59IikOBgBGLjaoe', 'Juna', 'Clairo', 'spA6', 'Charm', 'spB6', 197000),
]
const SP_GENRES = { spA1: ['pop'], spA2: ['pop'], spA3: ['bedroom pop', 'jazz pop'], spA4: ['pop'], spA5: ['hip hop', 'west coast rap'], spA6: ['bedroom pop', 'indie pop'] }

// Last.fm scrobbles, newest first: a catalog song, a Spotify-matchable one, a Last.fm-only one, and one playing now.
export const SCROBBLES = (now) => [
  { name: 'From The Start', artist: { '#text': 'Laufey' }, album: { '#text': 'Bewitched' }, '@attr': { nowplaying: 'true' } },
  { name: 'Juna', artist: { '#text': 'Clairo' }, album: { '#text': 'Charm' }, date: { uts: String(Math.floor((now - 10 * 60e3) / 1000)) } },
  { name: 'From The Start', artist: { '#text': 'Laufey' }, album: { '#text': 'Bewitched' }, date: { uts: String(Math.floor((now - 25 * 60e3) / 1000)) } },
  { name: 'Basement Demo (unreleased)', artist: { '#text': 'The Nobles Jazz Band' }, album: { '#text': '' }, date: { uts: String(Math.floor((now - 40 * 60e3) / 1000)) } },
  { name: 'Espresso', artist: { '#text': 'Sabrina Carpenter' }, album: { '#text': "Short n' Sweet" }, date: { uts: String(Math.floor((now - 70 * 60e3) / 1000)) } },
]

export function fakeFetch(calls = []) {
  return async (url, init = {}) => {
    const u = new URL(url)
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (u.host === 'accounts.spotify.com' && u.pathname === '/api/token') {
      calls.push('spotify:token')
      const ok = init.headers?.Authorization === 'Basic ' + btoa(`${FAKE.spotifyId}:${FAKE.spotifySecret}`)
      return ok ? json({ access_token: 'APP', expires_in: 3600 }) : json({ error: 'invalid_client' }, 401)
    }
    if (u.host === 'api.spotify.com') {
      if (init.headers?.Authorization !== 'Bearer APP') return json({ error: 'no token' }, 401)
      const path = u.pathname.replace('/v1', '')
      calls.push('spotify:' + path)
      if (path === '/search') {
        const q = u.searchParams.get('q').toLowerCase().replace(/track:|artist:/g, ' ')
        const words = q.split(/\s+/).filter(Boolean)
        const items = SP_TRACKS.filter((t) => words.every((w) => `${t.name} ${t.artists[0].name}`.toLowerCase().includes(w)))
        return json({ tracks: { items } })
      }
      if (path.startsWith('/tracks/')) { const t = SP_TRACKS.find((x) => x.id === path.split('/')[2]); return t ? json(t) : json({ error: 'not found' }, 404) }
      if (path === '/artists') return json({ artists: u.searchParams.get('ids').split(',').map((id) => ({ id, genres: SP_GENRES[id] ?? [] })) })
      return json({ error: 'unknown' }, 404)
    }
    if (u.host === 'ws.audioscrobbler.com') {
      const p = Object.fromEntries(u.searchParams)
      calls.push('lastfm:' + p.method)
      if (p.api_key !== FAKE.lastfmKey) return json({ error: 10, message: 'Invalid API key' }, 403)
      if (p.method === 'auth.getSession') {
        const { api_sig, format, ...rest } = p
        const want = md5(Object.keys(rest).sort().map((k) => k + rest[k]).join('') + FAKE.lastfmSecret)
        if (api_sig !== want) return json({ error: 13, message: 'Invalid method signature supplied' }, 403)
        if (p.token !== FAKE.lastfmToken) return json({ error: 4, message: 'Unauthorized Token' }, 403)
        return json({ session: { name: FAKE.lastfmUser, key: 'SK', subscriber: 0 } })
      }
      if (p.method === 'user.getrecenttracks') {
        const from = Number(p.from ?? 0) * 1000
        const all = SCROBBLES(Date.now()).filter((s) => !s.date || Number(s.date.uts) * 1000 >= from)
        return json({ recenttracks: { track: all, '@attr': { totalPages: '1', user: p.user } } })
      }
    }
    return json({ error: 'unexpected request ' + url }, 500)
  }
}

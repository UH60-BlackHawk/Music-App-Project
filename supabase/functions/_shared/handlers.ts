// What the server functions actually do. Runtime-agnostic: the Supabase wrappers (../spotify/index.ts,
// ../lastfm/index.ts) and the local test bridge both call these with their own database and fetch.
import { cleanTitle, emptyBundle, shortHash, type CatalogBundle, type CatalogTrack } from './music.ts'
import { spotifyIdFromLink, type Spotify, type SpTrack } from './spotify.ts'
import type { Lastfm } from './lastfm.ts'

/** The database operations the functions need. Runs with server rights (security rules bypassed), so each use is deliberate. */
export interface Db {
  trackBySpotifyId(spotifyId: string): Promise<CatalogTrack | null>
  /** Catalog songs by this artist (any case); the caller matches titles. */
  tracksByArtistName(artist: string): Promise<(CatalogTrack & { artistName: string })[]>
  artistIdByName(name: string): Promise<string | null>
  trackInfo(trackId: string): Promise<{ title: string; artist: string; spotifyId: string | null } | null>
  setTrackSpotifyId(trackId: string, spotifyId: string): Promise<void>
  insertCatalog(b: CatalogBundle): Promise<void>
  lastfmProfile(uid: string): Promise<{ username: string | null; syncedAt: number | null }>
  /** Link a Last.fm account to a student. Throws if it's already linked to someone else. */
  linkLastfm(uid: string, username: string): Promise<void>
  finishLastfmSync(uid: string, syncedAt: number | null, nowPlaying: string | null): Promise<void>
  insertListens(uid: string, plays: { trackId: string; at: number }[]): Promise<number>
}

export class UserError extends Error {}

export interface SongResult { id: string; title: string; artist: string; album: string; dur: number; spotifyId: string; isNew: boolean }

/** Find each Spotify track in the catalog (by Spotify id, then by title + artist) or describe new catalog rows for it. */
async function toCatalog(db: Db, spotify: Spotify, items: SpTrack[]) {
  const bundle = emptyBundle()
  const results: SongResult[] = []
  const needGenres = new Set<string>()
  const pending: { t: SpTrack; result: SongResult }[] = []
  for (const t of items) {
    const main = t.artists[0] ?? { id: 'unknown', name: 'Unknown artist' }
    let found = await db.trackBySpotifyId(t.id)
    if (!found) {
      const want = cleanTitle(t.name)
      found = (await db.tracksByArtistName(main.name)).find((x) => cleanTitle(x.title) === want) ?? null
      if (found && !found.spotifyId) await db.setTrackSpotifyId(found.id, t.id)
    }
    const result: SongResult = { id: found?.id ?? 't-sp-' + t.id, title: t.name, artist: main.name, album: t.album.name, dur: Math.round(t.duration_ms / 1000), spotifyId: t.id, isNew: !found }
    results.push(result)
    if (!found) { pending.push({ t, result }); if (!(await db.artistIdByName(main.name))) needGenres.add(main.id) }
  }
  const genres = needGenres.size ? await spotify.genres([...needGenres]) : {}
  for (const { t, result } of pending) {
    const main = t.artists[0] ?? { id: 'unknown', name: 'Unknown artist' }
    const artistId = (await db.artistIdByName(main.name)) ?? 'ar-sp-' + main.id
    if (artistId.startsWith('ar-sp-') && !bundle.artists.some((a) => a.id === artistId)) bundle.artists.push({ id: artistId, name: main.name, genre: genres[main.id] ?? 'pop', spotifyId: main.id })
    const albumId = 'al-sp-' + t.album.id
    if (!bundle.albums.some((a) => a.id === albumId)) bundle.albums.push({ id: albumId, title: t.album.name, artistId, year: Number((t.album.release_date ?? '').slice(0, 4)) || 0, spotifyId: t.album.id })
    if (!bundle.tracks.some((x) => x.id === result.id)) bundle.tracks.push({ id: result.id, title: t.name, artistId, albumId, dur: result.dur, spotifyId: t.id })
  }
  return { results, catalog: bundle }
}

/** POST /functions/v1/spotify — search all of Spotify, look up a pasted link, or find a catalog song's Spotify id. */
export async function spotifyAction(body: Record<string, unknown>, ctx: { db: Db; spotify: Spotify }) {
  const { db, spotify } = ctx
  switch (body.action) {
    case 'search': {
      const q = String(body.q ?? '').trim().slice(0, 100)
      if (q.length < 2) return { results: [], catalog: emptyBundle() }
      const linked = spotifyIdFromLink(q)
      if (linked) { const t = await spotify.track(linked); return toCatalog(db, spotify, t ? [t] : []) }
      return toCatalog(db, spotify, await spotify.search(q, 12))
    }
    case 'track': {
      const id = spotifyIdFromLink(String(body.link ?? '')) ?? String(body.spotifyId ?? '')
      const t = await spotify.track(id)
      if (!t) throw new UserError('That link isn’t a Spotify song we could find.')
      return toCatalog(db, spotify, [t])
    }
    case 'resolve': {
      const info = await db.trackInfo(String(body.trackId ?? ''))
      if (!info) throw new UserError('Unknown song')
      if (info.spotifyId) return { spotifyId: info.spotifyId }
      const items = await spotify.search(`track:${info.title} artist:${info.artist}`, 5)
      const want = cleanTitle(info.title)
      const best = items.find((t) => cleanTitle(t.name) === want && t.artists.some((a) => a.name.toLowerCase() === info.artist.toLowerCase())) ?? items[0]
      if (!best) return { spotifyId: null }
      await db.setTrackSpotifyId(String(body.trackId), best.id)
      return { spotifyId: best.id }
    }
    default: throw new UserError('Unknown action')
  }
}

const SYNC_WINDOW_MS = 14 * 864e5
const MAX_SPOTIFY_LOOKUPS = 40

/** POST /functions/v1/lastfm — link a Last.fm account (after Last.fm sign-in) and import recent plays. */
export async function lastfmAction(body: Record<string, unknown>, ctx: { uid: string; db: Db; lastfm: Lastfm; spotify: Spotify | null }) {
  const { uid, db, lastfm } = ctx
  if (body.action === 'connect') {
    const token = String(body.token ?? '')
    if (!/^[A-Za-z0-9]{20,64}$/.test(token)) throw new UserError('That Last.fm sign-in has expired. Try connecting again.')
    const username = await lastfm.usernameFromToken(token)
    await db.linkLastfm(uid, username)
    return { username, ...(await syncLastfm(ctx)) }
  }
  if (body.action === 'sync') return syncLastfm(ctx)
  throw new UserError('Unknown action')
}

async function syncLastfm(ctx: { uid: string; db: Db; lastfm: Lastfm; spotify: Spotify | null }) {
  const { uid, db, lastfm, spotify } = ctx
  const prof = await db.lastfmProfile(uid)
  if (!prof.username) throw new UserError('Connect Last.fm first.')
  const from = Math.floor((prof.syncedAt ?? Date.now() - SYNC_WINDOW_MS) / 1000)
  const scrobbles = await lastfm.recent(prof.username, from)

  // Match each distinct song once: catalog first, then Spotify search, else a Last.fm-only catalog entry.
  const ids = new Map<string, string>()
  const bundle = emptyBundle()
  let lookups = 0
  for (const s of scrobbles) {
    const key = cleanTitle(s.title) + '|' + s.artist.toLowerCase()
    if (ids.has(key) || !s.title || !s.artist) continue
    const known = (await db.tracksByArtistName(s.artist)).find((x) => cleanTitle(x.title) === cleanTitle(s.title))
    if (known) { ids.set(key, known.id); continue }
    if (spotify && lookups < MAX_SPOTIFY_LOOKUPS) {
      lookups++
      const items = await spotify.search(`track:${s.title} artist:${s.artist}`, 3).catch(() => [])
      const match = items.find((t) => cleanTitle(t.name) === cleanTitle(s.title)) ?? null
      if (match) {
        const { results, catalog } = await toCatalog(db, spotify, [match])
        ids.set(key, results[0].id)
        for (const k of ['artists', 'albums', 'tracks'] as const) for (const x of catalog[k]) if (!(bundle[k] as { id: string }[]).some((y) => y.id === x.id)) (bundle[k] as unknown[]).push(x)
        continue
      }
    }
    const artistId = (await db.artistIdByName(s.artist)) ?? 'ar-lf-' + shortHash(s.artist.toLowerCase())
    if (artistId.startsWith('ar-lf-') && !bundle.artists.some((a) => a.id === artistId)) bundle.artists.push({ id: artistId, name: s.artist, genre: 'pop' })
    const albumId = 'al-lf-' + shortHash((s.album || s.title) + '|' + s.artist.toLowerCase())
    if (!bundle.albums.some((a) => a.id === albumId)) bundle.albums.push({ id: albumId, title: s.album || s.title, artistId, year: 0 })
    const trackId = 't-lf-' + shortHash(key)
    if (!bundle.tracks.some((t) => t.id === trackId)) bundle.tracks.push({ id: trackId, title: s.title, artistId, albumId, dur: 180 })
    ids.set(key, trackId)
  }
  await db.insertCatalog(bundle)
  const idFor = (s: { title: string; artist: string }) => ids.get(cleanTitle(s.title) + '|' + s.artist.toLowerCase())
  const plays = scrobbles.filter((s) => s.playedAt && idFor(s)).map((s) => ({ trackId: idFor(s)!, at: s.playedAt! }))
  const imported = await db.insertListens(uid, plays)
  const now = scrobbles.find((s) => s.nowPlaying)
  const latest = plays.reduce((m, p) => Math.max(m, p.at), prof.syncedAt ?? 0)
  await db.finishLastfmSync(uid, latest || null, now ? idFor(now) ?? null : null)
  return { imported, seen: scrobbles.length }
}

// The Db operations (see handlers.ts) implemented with supabase-js and the service-role key.
// Only imported by the Deno entry points; the client is passed in so this file has no runtime imports.
import { UserError, type Db } from './handlers.ts'
import type { CatalogTrack } from './music.ts'

// deno-lint-ignore no-explicit-any
type Client = any
const like = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c) // exact, case-insensitive match with ilike
// deno-lint-ignore no-explicit-any
const track = (r: any): CatalogTrack => ({ id: r.id, title: r.title, artistId: r.artist_id, albumId: r.album_id, dur: r.duration_s, spotifyId: r.spotify_id ?? undefined })
// deno-lint-ignore no-explicit-any
const must = ({ data, error }: { data: any; error: { message: string } | null }): any => { if (error) throw new Error(error.message); return data }

export function supabaseDb(sb: Client): Db {
  return {
    async trackBySpotifyId(id) {
      const r = must(await sb.from('tracks').select('*').eq('spotify_id', id).maybeSingle())
      return r ? track(r) : null
    },
    async tracksByArtistName(name) {
      const rows = must(await sb.from('tracks').select('*, artists!inner(name)').ilike('artists.name', like(name)).limit(200)) ?? []
      // deno-lint-ignore no-explicit-any
      return rows.map((r: any) => ({ ...track(r), artistName: r.artists.name }))
    },
    async artistIdByName(name) {
      const rows = must(await sb.from('artists').select('id').ilike('name', like(name)).limit(1)) ?? []
      return rows[0]?.id ?? null
    },
    async trackInfo(id) {
      const r = must(await sb.from('tracks').select('title, spotify_id, artists(name)').eq('id', id).maybeSingle())
      return r ? { title: r.title, artist: r.artists?.name ?? '', spotifyId: r.spotify_id } : null
    },
    async setTrackSpotifyId(id, spotifyId) {
      await sb.from('tracks').update({ spotify_id: spotifyId }).eq('id', id).is('spotify_id', null) // ignore clashes
    },
    async insertCatalog(b) {
      if (b.artists.length) must(await sb.from('artists').upsert(b.artists.map((a) => ({ id: a.id, name: a.name, genre: a.genre, spotify_id: a.spotifyId ?? null })), { ignoreDuplicates: true }))
      if (b.albums.length) must(await sb.from('albums').upsert(b.albums.map((a) => ({ id: a.id, title: a.title, artist_id: a.artistId, year: a.year || null, spotify_id: a.spotifyId ?? null })), { ignoreDuplicates: true }))
      if (b.tracks.length) must(await sb.from('tracks').upsert(b.tracks.map((t) => ({ id: t.id, title: t.title, artist_id: t.artistId, album_id: t.albumId, duration_s: t.dur, spotify_id: t.spotifyId ?? null })), { ignoreDuplicates: true }))
    },
    async lastfmProfile(uid) {
      const r = must(await sb.from('profiles').select('lastfm_username, lastfm_synced_at').eq('id', uid).single())
      return { username: r.lastfm_username, syncedAt: r.lastfm_synced_at ? Date.parse(r.lastfm_synced_at) : null }
    },
    async linkLastfm(uid, username) {
      const taken = must(await sb.from('profiles').select('id').ilike('lastfm_username', like(username)).neq('id', uid).limit(1)) ?? []
      if (taken.length) throw new UserError('That Last.fm account is already linked to another student.')
      must(await sb.from('profiles').update({ lastfm_username: username, lastfm_synced_at: null }).eq('id', uid))
    },
    async finishLastfmSync(uid, syncedAt, nowPlaying) {
      const patch: Record<string, unknown> = {}
      if (syncedAt) patch.lastfm_synced_at = new Date(syncedAt).toISOString()
      if (nowPlaying) patch.now_playing = nowPlaying
      if (Object.keys(patch).length) must(await sb.from('profiles').update(patch).eq('id', uid))
    },
    async insertListens(uid, plays) {
      if (!plays.length) return 0
      const rows = must(await sb.from('listens').upsert(
        plays.map((p) => ({ user_id: uid, track_id: p.trackId, played_at: new Date(p.at).toISOString() })),
        { onConflict: 'user_id,track_id,played_at', ignoreDuplicates: true },
      ).select('id')) ?? []
      return rows.length
    },
  }
}

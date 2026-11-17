// The server functions' Db (supabase/functions/_shared/handlers.ts) on a plain Postgres connection, for tests.
// Runs with server rights, like the Supabase service role.
import { UserError } from '../functions/_shared/handlers.ts'

const track = (r) => ({ id: r.id, title: r.title, artistId: r.artist_id, albumId: r.album_id, dur: r.duration_s, spotifyId: r.spotify_id ?? undefined })

export function pgDb(asUser) {
  const q = (sql, params = []) => asUser('service', (c) => c.query(sql, params))
  return {
    async trackBySpotifyId(id) { const r = await q('select * from tracks where spotify_id = $1', [id]); return r.rows[0] ? track(r.rows[0]) : null },
    async tracksByArtistName(name) {
      const r = await q('select t.*, a.name artist_name from tracks t join artists a on a.id = t.artist_id where lower(a.name) = lower($1)', [name])
      return r.rows.map((x) => ({ ...track(x), artistName: x.artist_name }))
    },
    async artistIdByName(name) { const r = await q('select id from artists where lower(name) = lower($1) limit 1', [name]); return r.rows[0]?.id ?? null },
    async trackInfo(id) {
      const r = await q('select t.title, t.spotify_id, a.name from tracks t join artists a on a.id = t.artist_id where t.id = $1', [id])
      return r.rows[0] ? { title: r.rows[0].title, artist: r.rows[0].name, spotifyId: r.rows[0].spotify_id } : null
    },
    async setTrackSpotifyId(id, sp) { await q('update tracks set spotify_id = $2 where id = $1 and spotify_id is null', [id, sp]).catch(() => {}) },
    async insertCatalog(b) {
      for (const a of b.artists) await q('insert into artists (id, name, genre, spotify_id) values ($1,$2,$3,$4) on conflict do nothing', [a.id, a.name, a.genre, a.spotifyId ?? null])
      for (const a of b.albums) await q('insert into albums (id, title, artist_id, year, spotify_id) values ($1,$2,$3,$4,$5) on conflict do nothing', [a.id, a.title, a.artistId, a.year || null, a.spotifyId ?? null])
      for (const t of b.tracks) await q('insert into tracks (id, title, artist_id, album_id, duration_s, spotify_id) values ($1,$2,$3,$4,$5,$6) on conflict do nothing', [t.id, t.title, t.artistId, t.albumId, t.dur, t.spotifyId ?? null])
    },
    async lastfmProfile(uid) {
      const r = await q('select lastfm_username, lastfm_synced_at from profiles where id = $1', [uid])
      return { username: r.rows[0]?.lastfm_username ?? null, syncedAt: r.rows[0]?.lastfm_synced_at ? r.rows[0].lastfm_synced_at.getTime() : null }
    },
    async linkLastfm(uid, username) {
      const taken = await q('select id from profiles where lower(lastfm_username) = lower($1) and id <> $2', [username, uid])
      if (taken.rowCount) throw new UserError('That Last.fm account is already linked to another student.')
      await q('update profiles set lastfm_username = $2, lastfm_synced_at = null where id = $1', [uid, username])
    },
    async finishLastfmSync(uid, at, now) {
      if (at) await q('update profiles set lastfm_synced_at = $2 where id = $1', [uid, new Date(at)])
      if (now) await q('update profiles set now_playing = $2 where id = $1', [uid, now])
    },
    async insertListens(uid, plays) {
      let n = 0
      for (const p of plays) n += (await q('insert into listens (user_id, track_id, played_at) values ($1,$2,$3) on conflict do nothing', [uid, p.trackId, new Date(p.at)])).rowCount
      return n
    },
  }
}

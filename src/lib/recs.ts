import type { Data, ID, Track } from '../types'
import { artists, trackList, tracks } from '../data/catalog'
import { DAY } from '../data/seed'
import { visibleFriends } from './select'

export interface Suggestion { track: Track; score: number; reason: string }

const first = (name: string) => name.split(' ')[0]

/**
 * "For You": scored entirely from in-app data (my listens, friends' listens/ratings, direct recs).
 * Does not use Spotify's recommendations endpoint. Each suggestion carries its strongest reason.
 */
export function forYou(s: Data, n = 12): Suggestion[] {
  const now = Date.now()
  const friends = visibleFriends(s)
  const mine = s.listens.filter((l) => l.userId === 'me')
  const myTrack: Record<ID, number> = {}
  const myArtist: Record<ID, number> = {}
  const myGenre: Record<string, number> = {}
  for (const l of mine) {
    const t = tracks[l.trackId]
    myTrack[t.id] = (myTrack[t.id] ?? 0) + 1
    myArtist[t.artistId] = (myArtist[t.artistId] ?? 0) + 1
    const g = artists[t.artistId].genre
    myGenre[g] = (myGenre[g] ?? 0) + 1
  }
  const maxArtist = Math.max(1, ...Object.values(myArtist))
  const maxGenre = Math.max(1, ...Object.values(myGenre))
  const topGenre = Object.entries(myGenre).sort((a, b) => b[1] - a[1])[0]?.[0]

  const weekPlayers: Record<ID, Set<ID>> = {}
  for (const l of s.listens) {
    if (now - l.at < 7 * DAY && friends.includes(l.userId)) (weekPlayers[l.trackId] ??= new Set()).add(l.userId)
  }

  const out: Suggestion[] = []
  for (const t of trackList) {
    const played = myTrack[t.id] ?? 0
    if (played >= 3) continue // already in rotation
    const players = [...(weekPlayers[t.id] ?? [])]
    const high = s.ratings.filter((r) => friends.includes(r.userId) && r.stars >= 4 && !r.hidden && (r.itemId === t.id || r.itemId === t.albumId))
    const sent = s.recs.filter((r) => r.toId === 'me' && r.trackId === t.id && !s.blocks.includes(r.fromId))
    const artistAff = (myArtist[t.artistId] ?? 0) / maxArtist
    const genre = artists[t.artistId].genre
    const genreAff = (myGenre[genre] ?? 0) / maxGenre

    const parts: [number, string][] = [
      [players.length * 3, players.length > 1 ? `${players.length} friends played this this week` : players.length ? `${first(s.users[players[0]].name)} played this this week` : ''],
      [high.length * 2.5, high.length ? `${first(s.users[high[0].userId].name)} rated ${high[0].itemType === 'album' ? 'the album' : 'this'} ★ ${high[0].stars}` : ''],
      [sent.length * 4, sent.length ? `${first(s.users[sent[0].fromId].name)} sent you this` : ''],
      [artistAff * 4, artistAff > 0 ? `Because you listen to ${artists[t.artistId].name}` : ''],
      [genreAff * 2, genreAff > 0 ? (genre === topGenre ? `Big in ${genre}, your top genre` : `Because you listen to ${genre}`) : ''],
    ]
    const score = parts.reduce((a, p) => a + p[0], 0) - played * 1.5
    const best = parts.filter((p) => p[1]).sort((a, b) => b[0] - a[0])[0]
    if (score > 0.5 && best) out.push({ track: t, score, reason: best[1] })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n)
}

/** "Your Friends Are Into": what the people I follow (and can see) played most this week. */
export function friendsInto(s: Data, n = 8) {
  const now = Date.now()
  const friends = visibleFriends(s)
  const who: Record<ID, Set<ID>> = {}
  const plays: Record<ID, number> = {}
  const artistWho: Record<ID, Set<ID>> = {}
  for (const l of s.listens) {
    if (now - l.at >= 7 * DAY || !friends.includes(l.userId)) continue
    ;(who[l.trackId] ??= new Set()).add(l.userId)
    plays[l.trackId] = (plays[l.trackId] ?? 0) + 1
    ;(artistWho[tracks[l.trackId].artistId] ??= new Set()).add(l.userId)
  }
  const songs = Object.keys(who)
    .map((id) => ({ track: tracks[id], friends: who[id].size, plays: plays[id] }))
    .sort((a, b) => b.friends - a.friends || b.plays - a.plays)
    .slice(0, n)
    .map((x) => ({ ...x, reason: `${x.friends} friend${x.friends === 1 ? '' : 's'} · ${x.plays} plays this week` }))
  const arts = Object.keys(artistWho)
    .map((id) => ({ artist: artists[id], friends: artistWho[id].size }))
    .sort((a, b) => b.friends - a.friends)
    .slice(0, 6)
  return { songs, artists: arts }
}

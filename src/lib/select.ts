import type { Data, ID, ItemType, Listen, Rating, Rec, Track, User } from '../types'
import { albums, artists, trackList, tracks } from '../data/catalog'
import { DAY, HOUR } from '../data/seed'

export const following = (s: Data, id: ID) => s.follows.filter((f) => f[0] === id).map((f) => f[1])
export const followers = (s: Data, id: ID) => s.follows.filter((f) => f[1] === id).map((f) => f[0])
export const isFollowing = (s: Data, a: ID, b: ID) => s.follows.some((f) => f[0] === a && f[1] === b)
export const isMutual = (s: Data, a: ID, b: ID) => isFollowing(s, a, b) && isFollowing(s, b, a)

/** Central privacy rule: can `viewer` see `owner`'s activity? Every feed/profile/recs query goes through this. */
export function canSee(s: Data, viewer: ID, owner: ID): boolean {
  if (viewer === owner) return true
  const u = s.users[owner]
  if (!u || s.blocks.includes(owner)) return false
  if (u.sharingPaused || u.privacy === 'private') return false
  return u.privacy === 'school' || isMutual(s, viewer, owner)
}

/** People I follow whose activity I'm allowed to see. */
export const visibleFriends = (s: Data) => following(s, 'me').filter((id) => canSee(s, 'me', id))

export const timeAgo = (at: number) => {
  const d = Date.now() - at
  if (d < 60e3) return 'now'
  if (d < HOUR) return `${Math.floor(d / 60e3)}m`
  if (d < DAY) return `${Math.floor(d / HOUR)}h`
  return `${Math.floor(d / DAY)}d`
}

const countBy = <T,>(xs: T[], key: (x: T) => ID) => {
  const m: Record<ID, number> = {}
  for (const x of xs) { const k = key(x); m[k] = (m[k] ?? 0) + 1 }
  return m
}
const ranked = (m: Record<ID, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])

export const userListens = (s: Data, id: ID) => s.listens.filter((l) => l.userId === id)
export const topArtists = (s: Data, id: ID, n = 5) => ranked(countBy(userListens(s, id), (l) => tracks[l.trackId].artistId)).slice(0, n)
export const topTracks = (s: Data, id: ID, n = 5) => ranked(countBy(userListens(s, id), (l) => l.trackId)).slice(0, n)

export function avgRating(s: Data, type: ItemType, id: ID) {
  const rs = s.ratings.filter((r) => r.itemType === type && r.itemId === id)
  return { avg: rs.length ? rs.reduce((a, r) => a + r.stars, 0) / rs.length : 0, count: rs.length }
}
export const myRating = (s: Data, type: ItemType, id: ID) => s.ratings.find((r) => r.userId === 'me' && r.itemType === type && r.itemId === id)
export const reviewsFor = (s: Data, type: ItemType, id: ID) =>
  s.ratings.filter((r) => r.itemType === type && r.itemId === id && !r.hidden && canSee(s, 'me', r.userId)).sort((a, b) => b.at - a.at)

export const trophiesForItem = (s: Data, id: ID) => s.nma.hall.filter((h) => h.itemId === id)
export const trophiesForUser = (s: Data, id: ID) => s.nma.hall.filter((h) => h.nominatorId === id)

// ---------- Feed ----------
export type FeedItem =
  | { kind: 'listen'; id: string; at: number; user: User; track: Track; more: number }
  | { kind: 'rating'; id: string; at: number; user: User; rating: Rating }
  | { kind: 'rec'; id: string; at: number; user: User; rec: Rec }

export function feed(s: Data): FeedItem[] {
  const friends = visibleFriends(s)
  const items: FeedItem[] = []
  for (const id of friends) {
    const ls = s.listens.filter((l) => l.userId === id && Date.now() - l.at < 36 * HOUR)
    if (ls.length) {
      const distinct = new Set(ls.map((l) => l.trackId))
      items.push({ kind: 'listen', id: 'fl-' + id, at: ls[0].at, user: s.users[id], track: tracks[ls[0].trackId], more: distinct.size - 1 })
    }
  }
  for (const r of s.ratings) {
    if (!r.hidden && (friends.includes(r.userId) || r.userId === 'me') && Date.now() - r.at < 4 * DAY)
      items.push({ kind: 'rating', id: r.id, at: r.at, user: s.users[r.userId], rating: r })
  }
  for (const r of s.recs) {
    if (!r.hidden && r.toId === null && (friends.includes(r.fromId) || r.fromId === 'me')) items.push({ kind: 'rec', id: r.id, at: r.at, user: s.users[r.fromId], rec: r })
  }
  return items.sort((a, b) => b.at - a.at).slice(0, 18)
}
export const inbox = (s: Data) => s.recs.filter((r) => r.toId === 'me' && !r.hidden && !s.blocks.includes(r.fromId)).sort((a, b) => b.at - a.at)

// ---------- Leaderboard (aggregate counts from opted-in users only; never who listened) ----------
export type Range = 'week' | 'month' | 'all'
const rangeMs: Record<Range, number> = { week: 7 * DAY, month: 30 * DAY, all: Infinity }
export const optedInListens = (s: Data): Listen[] => s.listens.filter((l) => s.users[l.userId]?.leaderboardOptIn)

export function leaderboard(s: Data, kind: 'songs' | 'artists' | 'albums', range: Range) {
  const now = Date.now()
  const ls = optedInListens(s).filter((l) => now - l.at < rangeMs[range])
  const key = kind === 'songs' ? (l: Listen) => l.trackId : kind === 'artists' ? (l: Listen) => tracks[l.trackId].artistId : (l: Listen) => tracks[l.trackId].albumId
  return ranked(countBy(ls, key)).slice(0, 20).map(([id, plays]) => ({ id, plays }))
}
export function trending(s: Data) {
  const now = Date.now()
  const ls = optedInListens(s)
  const cur = countBy(ls.filter((l) => now - l.at < 7 * DAY), (l) => l.trackId)
  const prev = countBy(ls.filter((l) => now - l.at >= 7 * DAY && now - l.at < 14 * DAY), (l) => l.trackId)
  return trackList
    .map((t) => ({ id: t.id, plays: cur[t.id] ?? 0, delta: (cur[t.id] ?? 0) - (prev[t.id] ?? 0), pct: Math.round((((cur[t.id] ?? 0) - (prev[t.id] ?? 0)) / Math.max(1, prev[t.id] ?? 0)) * 100) }))
    .filter((x) => x.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 15)
}

// ---------- Song / Album of the Day ----------
export function dailyPick(s: Data): { trackId: ID; albumId: ID; why: string } {
  if (s.daily.mode === 'manual') return { trackId: s.daily.trackId, albumId: s.daily.albumId, why: 'Picked by the Aux admins' }
  const now = Date.now()
  const score: Record<ID, number> = {}
  let why: string
  if (s.daily.metric === 'shared') {
    why = 'Most shared at Nobles in the last 24 hours'
    optedInListens(s).filter((l) => now - l.at < DAY).forEach((l) => (score[l.trackId] = (score[l.trackId] ?? 0) + 1))
    s.recs.filter((r) => now - r.at < DAY).forEach((r) => (score[r.trackId] = (score[r.trackId] ?? 0) + 3))
  } else {
    why = 'Highest rated at Nobles in the last 24 hours'
    let rs = s.ratings.filter((r) => r.itemType === 'track' && now - r.at < DAY)
    if (rs.length < 3) rs = s.ratings.filter((r) => r.itemType === 'track' && now - r.at < 7 * DAY)
    const sum: Record<ID, [number, number]> = {}
    rs.forEach((r) => { const x = (sum[r.itemId] ??= [0, 0]); x[0] += r.stars; x[1]++ })
    Object.entries(sum).forEach(([id, [t, n]]) => (score[id] = t / n + Math.min(n, 5) * 0.2))
  }
  const trackId = ranked(score)[0]?.[0] ?? s.daily.trackId
  const albumScore: Record<ID, number> = {}
  Object.entries(score).forEach(([id, v]) => {
    const a = tracks[id].albumId
    albumScore[a] = s.daily.metric === 'shared' ? (albumScore[a] ?? 0) + v : Math.max(albumScore[a] ?? 0, v)
  })
  // Avoid featuring the same record twice when possible.
  const albumId = ranked(albumScore).find(([id]) => id !== tracks[trackId].albumId)?.[0] ?? ranked(albumScore)[0]?.[0] ?? s.daily.albumId
  return { trackId, albumId, why }
}

// ---------- Predictions ----------
export const POINTS_PER_PICK = 10
export function predictionBoard(s: Data) {
  const pts: Record<ID, number> = {}
  for (const p of s.picks) {
    const c = s.events.find((e) => e.id === p.eventId)?.categories.find((x) => x.id === p.categoryId)
    if (c?.winner && c.winner === p.nominee) pts[p.userId] = (pts[p.userId] ?? 0) + POINTS_PER_PICK
    else pts[p.userId] ??= 0
  }
  return ranked(pts).map(([userId, points]) => ({ userId, points }))
}

export const artistName = (trackId: ID) => artists[tracks[trackId].artistId].name
export const albumArtist = (albumId: ID) => artists[albums[albumId].artistId].name

// ---------- Basic text moderation ----------
const BLOCKED = ['fuck', 'shit', 'bitch', 'asshole', 'slut', 'whore', 'retard', 'kys']
export function moderate(text: string): { ok: boolean; text: string; error?: string } {
  const t = text.trim().slice(0, 240)
  const flat = t.toLowerCase().replace(/[^a-z]/g, '')
  if (BLOCKED.some((w) => flat.includes(w))) return { ok: false, text: t, error: 'Keep it kind — that language isn’t allowed on Aux.' }
  return { ok: true, text: t }
}

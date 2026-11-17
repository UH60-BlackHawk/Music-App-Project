/**
 * Live mode: keeps the app's store in sync with the backend.
 *
 * - load(): reads everything the signed-in student is allowed to see (the database's security rules
 *   decide what that is) and replaces the store's data with it.
 * - Every local change is diffed against the last synced state and written back (startSync()). Store
 *   actions stay exactly the same in sample and live mode; only this file knows about the database.
 * - New direct messages arrive live; everything is reloaded when the app regains focus.
 *
 * The signed-in student is always 'me' inside the store (as in sample mode); other students keep their
 * database ids. toRemote()/toLocal() translate at the boundary.
 */
import { create } from 'zustand'
import type { Album, Artist, Comment, Data, DailyConfig, HallEntry, ID, Listen, Nma, NmaCategory, NmaPhase, Nomination, Pick, PredEvent, Proposal, Rating, Rec, Report, Track, User, Vote } from '../types'
import { albums as staticAlbums, artists as staticArtists, registerCatalog, tracks as staticTracks } from '../data/catalog'
import { useStore } from '../store'
import { LIVE, liveHooks } from './mode'
import { remote, type AuthUser } from './remote'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Connection status shown in the UI. */
export const useLive = create<{ ready: boolean; user: AuthUser | null; error: string }>(() => ({ ready: !LIVE, user: null, error: '' }))

let uid = ''
let seasonId = ''
const toRemote = (id: ID) => (id === 'me' ? uid : id)
const toLocal = (id: ID | null) => (id === null ? null : id === uid ? 'me' : id)
const ts = (v: string | null | undefined) => (v ? Date.parse(v) : 0)
const iso = (ms: number) => new Date(ms).toISOString()

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function toUser(p: Row): User {
  const id = toLocal(p.id)!
  return {
    // Your own name stays empty until you set it, so onboarding asks for it; others fall back to their handle.
    id, name: p.name || (id === 'me' ? '' : p.handle), handle: p.handle, email: p.email, classYear: p.class_year ?? 0, color: p.color, photo: p.photo ?? undefined,
    bio: p.bio, privacy: p.privacy, sharingPaused: p.sharing_paused, leaderboardOptIn: p.leaderboard_opt_in, spotify: p.spotify_connected,
    favoriteAlbums: (p.favorite_albums ?? []).filter((a: string) => staticAlbums[a]), genres: p.genres ?? [], badges: p.badges ?? [],
    nowPlaying: p.now_playing && staticTracks[p.now_playing] ? p.now_playing : undefined, lastfm: p.lastfm_username ?? undefined,
  }
}

async function loadAll(): Promise<Partial<Data> & { profileNamed: boolean }> {
  const r = remote!
  const since = iso(Date.now() - 60 * 864e5)
  const [profiles, follows, blocks, artists, albums, tracks] = await Promise.all([
    r.select<Row>('profiles'), r.select('follows'), r.select('blocks'), r.select('artists'), r.select('albums'), r.select('tracks'),
  ])
  // Songs from Spotify / Last.fm that aren't in the built-in sample catalog.
  const extra = {
    artists: artists.filter((a) => !staticArtists[a.id as string]).map((a): Artist => ({ id: a.id as string, name: a.name as string, genre: a.genre as string, spotifyId: (a.spotify_id as string) ?? undefined })),
    albums: albums.filter((a) => !staticAlbums[a.id as string]).map((a): Album => ({ id: a.id as string, title: a.title as string, artistId: a.artist_id as string, year: (a.year as number) ?? 0, spotifyId: (a.spotify_id as string) ?? undefined })),
    tracks: tracks.filter((t) => !staticTracks[t.id as string]).map((t): Track => ({ id: t.id as string, title: t.title as string, artistId: t.artist_id as string, albumId: t.album_id as string, dur: t.duration_s as number, spotifyId: (t.spotify_id as string) ?? undefined })),
  }
  registerCatalog(extra)
  for (const t of tracks) if (t.spotify_id && staticTracks[t.id as string]) staticTracks[t.id as string].spotifyId = t.spotify_id as string

  const [listens, ratings, sent, comments, reports, daily, seasons, events, predCats, picks] = await Promise.all([
    r.select('listens', { gte: { played_at: since } }), r.select('ratings'), r.select('songs_sent'), r.select('comments'), r.select('reports'),
    r.select('daily_config'), r.select('nma_seasons', { order: ['created_at', false] }), r.select('pred_events'), r.select('pred_categories'), r.select('pred_picks'),
  ])
  const season = seasons[0]
  seasonId = (season?.id as string) ?? ''
  const [cats, noms, votes, proposals, winners] = await Promise.all([
    seasonId ? r.select('nma_categories', { eq: { season_id: seasonId } }) : [], seasonId ? r.select('nma_nominations', { eq: { season_id: seasonId } }) : [],
    seasonId ? r.select('nma_votes', { eq: { season_id: seasonId } }) : [], r.select('nma_proposals'), r.select('nma_winners'),
  ])

  const users: Record<ID, User> = {}
  for (const p of profiles) users[toLocal(p.id as string)!] = toUser(p)
  const me = profiles.find((p) => p.id === uid)
  const known = (id: string) => !!staticTracks[id]
  const seasonName = Object.fromEntries(seasons.map((s) => [s.id, s.name]))
  const categories: NmaCategory[] = cats.map((c) => ({ id: c.id as string, name: c.name as string, type: c.item_type as 'track' | 'album', icon: c.icon as string, active: c.active as boolean }))
  const nominations: Nomination[] = noms.map((n) => ({ id: `${n.category_id}:${n.user_id}`, categoryId: n.category_id as string, itemId: n.item_id as string, userId: toLocal(n.user_id as string)!, at: ts(n.created_at as string) }))
  // Ballot = four most-nominated per category, earliest nomination breaking ties (same rule as nma_ballot()).
  const ballot: Record<ID, ID[]> = {}
  for (const c of categories) {
    const tally = new Map<ID, { n: number; first: number }>()
    for (const n of nominations.filter((x) => x.categoryId === c.id)) { const t = tally.get(n.itemId) ?? { n: 0, first: n.at }; t.n++; t.first = Math.min(t.first, n.at); tally.set(n.itemId, t) }
    ballot[c.id] = [...tally.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first).slice(0, 4).map(([id]) => id)
  }
  const hall: HallEntry[] = winners.map((w) => ({
    id: `${w.season_id}:${w.category_id}`, season: seasonName[w.season_id as string] ?? (w.season_id as string), category: w.category_name as string,
    icon: categories.find((c) => c.id === w.category_id)?.icon ?? 'trophy', itemType: w.item_type as 'track' | 'album', itemId: w.item_id as string, nominatorId: toLocal(w.nominator_id as string | null),
  }))
  const nma: Nma = {
    season: (season?.name as string) ?? 'No season yet', phase: ((season?.phase as NmaPhase) ?? 'nominations'), closesAt: ts(season?.closes_at as string) || Date.now() + 7 * 864e5,
    categories, nominations, ballot,
    votes: votes.map((v): Vote => ({ categoryId: v.category_id as string, userId: toLocal(v.user_id as string)!, itemId: v.item_id as string })),
    proposals: proposals.map((p): Proposal => ({ id: p.id as string, userId: toLocal(p.user_id as string)!, name: p.name as string, status: p.status as Proposal['status'] })),
    winners: Object.fromEntries(winners.filter((w) => w.season_id === seasonId).map((w) => [w.category_id, { itemId: w.item_id as string, nominatorId: toLocal(w.nominator_id as string | null) }])),
    hall: hall.sort((a, b) => (a.season === b.season ? 0 : a.season < b.season ? 1 : -1)), flags: [],
  }
  const d = (daily[0] ?? {}) as Row
  return {
    profileNamed: !!me?.name,
    admin: !!me?.is_admin,
    users,
    catalogExtra: extra,
    follows: follows.map((f) => [toLocal(f.follower as string)!, toLocal(f.followee as string)!] as [ID, ID]),
    blocks: blocks.map((b) => toLocal(b.blocked as string)!),
    listens: listens.filter((l) => known(l.track_id as string)).map((l): Listen => ({ id: String(l.id), userId: toLocal(l.user_id as string)!, trackId: l.track_id as string, at: ts(l.played_at as string) })).sort((a, b) => b.at - a.at),
    ratings: ratings.map((x): Rating => ({ id: `${toLocal(x.user_id as string)}:${x.item_type}:${x.item_id}`, userId: toLocal(x.user_id as string)!, itemType: x.item_type as 'track' | 'album', itemId: x.item_id as string, stars: Number(x.stars), review: x.review as string, at: ts(x.updated_at as string), hidden: x.hidden as boolean })),
    recs: sent.filter((x) => known(x.track_id as string)).map((x): Rec => ({ id: x.id as string, fromId: toLocal(x.from_id as string)!, toId: toLocal(x.to_id as string | null), trackId: x.track_id as string, clipStart: (x.clip_start as number | null) ?? null, note: x.note as string, at: ts(x.created_at as string), read: x.read as boolean, hidden: x.hidden as boolean })),
    comments: comments.map((c): Comment => ({ id: c.id as string, userId: toLocal(c.user_id as string)!, targetId: c.target_id as string, text: c.text as string, at: ts(c.created_at as string), hidden: c.hidden as boolean })),
    reports: reports.map((x): Report => ({ id: x.id as string, reporterId: toLocal(x.reporter_id as string)!, kind: x.kind as Report['kind'], targetId: localTarget(x.kind as string, x.target_id as string), reason: x.reason as string, at: ts(x.created_at as string), status: x.status as Report['status'] })),
    daily: { mode: d.mode ?? 'manual', metric: d.metric ?? 'shared', trackId: d.track_id && known(d.track_id) ? d.track_id : 't-juna', albumId: d.album_id && staticAlbums[d.album_id] ? d.album_id : 'al-gnx' } as DailyConfig,
    nma,
    events: events.map((e): PredEvent => ({
      id: e.id as string, name: e.name as string, note: e.note as string, startsAt: ts(e.starts_at as string), locked: e.locked as boolean,
      categories: predCats.filter((c) => c.event_id === e.id).map((c) => ({ id: c.id as string, name: c.name as string, nominees: (c.nominees as string[]) ?? [], winner: (c.winner as string) ?? null })),
    })).sort((a, b) => b.startsAt - a.startsAt),
    picks: picks.map((p): Pick => ({ eventId: p.event_id as string, categoryId: p.category_id as string, userId: toLocal(p.user_id as string)!, nominee: p.nominee as string })),
  }
}

// Report targets: reviews are identified by "<user>:<type>:<item>" with the user id translated.
const remoteTarget = (kind: string, id: string) => {
  if (kind === 'user') return toRemote(id)
  if (kind === 'review') { const i = id.indexOf(':'); return toRemote(id.slice(0, i)) + id.slice(i) }
  return id
}
const localTarget = (kind: string, id: string) => {
  if (kind === 'user') return toLocal(id)!
  if (kind === 'review') { const i = id.indexOf(':'); return toLocal(id.slice(0, i)) + id.slice(i) }
  return id
}

// ---------------------------------------------------------------------------
// Applying server data without echoing it back as local changes
// ---------------------------------------------------------------------------
let applying = false
let synced: Data | null = null

function applyRemote(patch: Partial<Data>) {
  applying = true
  try {
    useStore.setState(patch)
    synced = useStore.getState()
  } finally { applying = false }
}

export async function reload() {
  if (!remote || !uid) return
  await flush()
  const { profileNamed, ...data } = await loadAll()
  applyRemote({ ...data, onboarded: useStore.getState().onboarded || profileNamed, signedIn: true })
}

// ---------------------------------------------------------------------------
// Writing local changes back
// ---------------------------------------------------------------------------
type Op = () => Promise<unknown>
let queue: Promise<void> = Promise.resolve()
let pending = 0

function enqueue(ops: Op[]) {
  if (!ops.length) return
  pending++
  queue = queue.then(async () => {
    let failed = false
    for (const op of ops) {
      try { await op() } catch (e) {
        failed = true
        console.warn('Aux sync:', e)
        useLive.setState({ error: explain(e) })
      }
    }
    // Something was refused: reload so the screen shows what was actually saved (not the rejected change).
    if (failed) queueMicrotask(() => { void reload().catch(() => {}) })
  }).finally(() => { pending-- })
}
export const flush = () => queue

const explain = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  if (/row-level security|permission denied/i.test(m)) return 'That wasn’t allowed. They may have blocked you, or changed who can message them.'
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'You seem to be offline. Your change wasn’t saved.'
  return m
}

/** Items in `next` that are new or changed (by reference) compared with `prev`, keyed by `key`. */
function diff<T>(prev: T[], next: T[], key: (x: T) => string) {
  const before = new Map(prev.map((x) => [key(x), x]))
  const after = new Map(next.map((x) => [key(x), x]))
  const added: T[] = [], changed: [T, T][] = [], removed: T[] = []
  for (const [k, x] of after) { const p = before.get(k); if (!p) added.push(x); else if (p !== x) changed.push([p, x]) }
  for (const [k, x] of before) if (!after.has(k)) removed.push(x)
  return { added, changed, removed }
}

/** Update the row if it exists, otherwise insert it (avoids needing update rights on key columns). */
const save = (table: string, match: Row, values: Row): Op => async () => {
  if (!(await remote!.update(table, match, values))) await remote!.insert(table, [{ ...match, ...values }])
}

const PROFILE_FIELDS: [keyof User, string][] = [
  ['name', 'name'], ['classYear', 'class_year'], ['color', 'color'], ['bio', 'bio'], ['photo', 'photo'], ['privacy', 'privacy'],
  ['sharingPaused', 'sharing_paused'], ['leaderboardOptIn', 'leaderboard_opt_in'], ['genres', 'genres'], ['favoriteAlbums', 'favorite_albums'],
  ['nowPlaying', 'now_playing'], ['spotify', 'spotify_connected'],
]

function opsFor(prev: Data, next: Data): Op[] {
  const r = remote!
  const ops: Op[] = []
  const catalogOps: Op[] = []

  // New songs first, so listens and messages that point at them can be saved.
  const pc = prev.catalogExtra ?? { artists: [], albums: [], tracks: [] }
  const nc = next.catalogExtra ?? { artists: [], albums: [], tracks: [] }
  const newArtists = diff(pc.artists, nc.artists, (x) => x.id).added
  const newAlbums = diff(pc.albums, nc.albums, (x) => x.id).added
  const newTracks = diff(pc.tracks, nc.tracks, (x) => x.id).added
  if (newArtists.length) catalogOps.push(() => r.insert('artists', newArtists.map((a) => ({ id: a.id, name: a.name, genre: a.genre, spotify_id: a.spotifyId ?? null })), { ignoreDuplicates: true }))
  if (newAlbums.length) catalogOps.push(() => r.insert('albums', newAlbums.map((a) => ({ id: a.id, title: a.title, artist_id: a.artistId, year: a.year || null, spotify_id: a.spotifyId ?? null })), { ignoreDuplicates: true }))
  if (newTracks.length) catalogOps.push(() => r.insert('tracks', newTracks.map((t) => ({ id: t.id, title: t.title, artist_id: t.artistId, album_id: t.albumId, duration_s: t.dur, spotify_id: t.spotifyId ?? null })), { ignoreDuplicates: true }))

  // Profile
  const pm = prev.users.me, nm = next.users.me
  if (pm && nm && pm !== nm) {
    const patch: Row = {}
    for (const [k, col] of PROFILE_FIELDS) if (pm[k] !== nm[k]) patch[col] = (nm[k] as unknown) ?? null
    if (Object.keys(patch).length) ops.push(() => r.update('profiles', { id: uid }, patch))
  }

  // Follows and blocks
  const f = diff(prev.follows, next.follows, (x) => x.join('>'))
  for (const [a, b] of f.added) if (a === 'me') ops.push(() => r.insert('follows', [{ follower: uid, followee: toRemote(b) }]))
  for (const [a, b] of f.removed) if (a === 'me') ops.push(() => r.remove('follows', { follower: uid, followee: toRemote(b) }))
  const bl = diff(prev.blocks, next.blocks, (x) => x)
  for (const b of bl.added) ops.push(() => r.insert('blocks', [{ blocker: uid, blocked: toRemote(b) }]))
  for (const b of bl.removed) ops.push(() => r.remove('blocks', { blocker: uid, blocked: toRemote(b) }))

  // Listens (only ever add your own)
  const myNewListens = diff(prev.listens, next.listens, (x) => x.id).added.filter((l) => l.userId === 'me')
  if (myNewListens.length) ops.push(() => r.insert('listens', myNewListens.map((l) => ({ user_id: uid, track_id: l.trackId, played_at: iso(l.at) })), { ignoreDuplicates: true }))

  // Ratings
  const ra = diff(prev.ratings.filter((x) => x.userId === 'me'), next.ratings.filter((x) => x.userId === 'me'), (x) => `${x.itemType}:${x.itemId}`)
  for (const x of [...ra.added, ...ra.changed.map(([, n]) => n)]) ops.push(save('ratings', { user_id: uid, item_type: x.itemType, item_id: x.itemId }, { stars: x.stars, review: x.review, updated_at: iso(x.at || Date.now()) }))
  for (const x of ra.removed) ops.push(() => r.remove('ratings', { user_id: uid, item_type: x.itemType, item_id: x.itemId }))

  // Songs sent, and marking received ones read
  const rc = diff(prev.recs, next.recs, (x) => x.id)
  const sentNow = rc.added.filter((x) => x.fromId === 'me')
  if (sentNow.length) ops.push(() => r.insert('songs_sent', sentNow.map((x) => ({ id: x.id, from_id: uid, to_id: x.toId ? toRemote(x.toId) : null, track_id: x.trackId, clip_start: x.clipStart, note: x.note }))))
  const readFrom = new Set(rc.changed.filter(([p, n]) => n.toId === 'me' && !p.read && n.read).map(([, n]) => n.fromId))
  for (const from of readFrom) ops.push(() => r.rpc('mark_thread_read', { p_other: toRemote(from) }))

  // Comments, reports, proposals
  for (const c of diff(prev.comments, next.comments, (x) => x.id).added.filter((x) => x.userId === 'me')) ops.push(() => r.insert('comments', [{ id: c.id, user_id: uid, target_id: c.targetId, text: c.text }]))
  for (const x of diff(prev.reports, next.reports, (x) => x.id).added.filter((x) => x.reporterId === 'me')) ops.push(() => r.insert('reports', [{ id: x.id, reporter_id: uid, kind: x.kind, target_id: remoteTarget(x.kind, x.targetId), reason: x.reason }]))
  const pr = diff(prev.nma.proposals, next.nma.proposals, (x) => x.id)
  for (const x of pr.added.filter((x) => x.userId === 'me')) ops.push(() => r.insert('nma_proposals', [{ id: x.id, user_id: uid, name: x.name }]))
  if (next.admin) for (const [p, n] of pr.changed) if (p.status !== n.status) ops.push(() => r.update('nma_proposals', { id: n.id }, { status: n.status }))

  // NMA nominations and votes (current season), prediction picks
  if (seasonId) {
    const no = diff(prev.nma.nominations.filter((x) => x.userId === 'me'), next.nma.nominations.filter((x) => x.userId === 'me'), (x) => x.categoryId)
    for (const x of [...no.added, ...no.changed.map(([, n]) => n)]) ops.push(save('nma_nominations', { season_id: seasonId, category_id: x.categoryId, user_id: uid }, { item_id: x.itemId }))
    const vo = diff(prev.nma.votes.filter((x) => x.userId === 'me'), next.nma.votes.filter((x) => x.userId === 'me'), (x) => x.categoryId)
    for (const x of [...vo.added, ...vo.changed.map(([, n]) => n)]) ops.push(save('nma_votes', { season_id: seasonId, category_id: x.categoryId, user_id: uid }, { item_id: x.itemId }))
    if (next.admin) {
      const ca = diff(prev.nma.categories, next.nma.categories, (x) => x.id)
      for (const c of ca.added) ops.push(() => r.insert('nma_categories', [{ season_id: seasonId, id: c.id, name: c.name, item_type: c.type, icon: c.icon, active: c.active }]))
      for (const [p, c] of ca.changed) if (p.active !== c.active) ops.push(() => r.update('nma_categories', { season_id: seasonId, id: c.id }, { active: c.active }))
    }
  }
  const pk = diff(prev.picks.filter((x) => x.userId === 'me'), next.picks.filter((x) => x.userId === 'me'), (x) => `${x.eventId}:${x.categoryId}`)
  for (const x of [...pk.added, ...pk.changed.map(([, n]) => n)]) ops.push(save('pred_picks', { event_id: x.eventId, category_id: x.categoryId, user_id: uid }, { nominee: x.nominee }))

  // Admin settings
  if (next.admin) {
    if (prev.daily !== next.daily) ops.push(() => r.update('daily_config', { id: true }, { mode: next.daily.mode, metric: next.daily.metric, track_id: next.daily.trackId, album_id: next.daily.albumId }))
    for (const e of next.events) {
      const p = prev.events.find((x) => x.id === e.id)
      if (!p || p === e) continue
      if (p.locked !== e.locked) ops.push(() => r.update('pred_events', { id: e.id }, { locked: e.locked }))
      for (const c of e.categories) {
        const pcat = p.categories.find((x) => x.id === c.id)
        if (pcat && pcat !== c) ops.push(() => r.update('pred_categories', { event_id: e.id, id: c.id }, { nominees: c.nominees, winner: c.winner }))
      }
    }
  }
  return [...catalogOps, ...ops]
}

// ---------------------------------------------------------------------------
// Start-up and sign-in
// ---------------------------------------------------------------------------
let unsubscribeStore: (() => void) | null = null
let unsubscribeMessages: (() => void) | null = null

function startSync() {
  unsubscribeStore?.()
  unsubscribeStore = useStore.subscribe((next) => {
    if (applying || !synced || !uid) return
    const prev = synced
    synced = next
    enqueue(opsFor(prev, next))
  })
  unsubscribeMessages?.()
  unsubscribeMessages = remote!.subscribeInserts('songs_sent', 'to_id', uid, (raw) => {
    const row = raw as Row
    const s = useStore.getState()
    if (s.recs.some((x) => x.id === row.id) || !staticTracks[row.track_id]) { if (!staticTracks[row.track_id]) void reload(); return }
    applyRemote({ recs: [{ id: row.id, fromId: toLocal(row.from_id)!, toId: 'me', trackId: row.track_id, clipStart: row.clip_start ?? null, note: row.note, at: ts(row.created_at), read: false }, ...s.recs] })
  })
}

/** Call after a successful sign-in (code or link) and on startup when a session exists. Returns whether the profile has a name yet. */
export async function onSignedIn(user: AuthUser): Promise<boolean> {
  uid = user.id
  useLive.setState({ user, error: '' })
  const { profileNamed, ...data } = await loadAll()
  applyRemote({ ...data, signedIn: true, onboarded: useStore.getState().onboarded || profileNamed })
  startSync()
  useLive.setState({ ready: true })
  return profileNamed
}

let lastFocus = 0
export async function startLive() {
  if (!LIVE || !remote) return
  liveHooks.setPhase = async (phase) => { await flush(); await remote!.rpc('nma_set_phase', { p_season: seasonId, p_phase: phase }); await reload() }
  liveHooks.resolveReport = async (id, removeIt) => { await flush(); await remote!.rpc('resolve_report', { p_report: id, p_remove: removeIt }); await reload() }
  liveHooks.signOut = async () => {
    await flush()
    unsubscribeStore?.(); unsubscribeMessages?.()
    await remote!.signOut()
    uid = ''
    synced = null
    useLive.setState({ user: null })
    location.hash = '#/' // the next person to sign in starts on Home
  }
  try {
    await remote.completeLinkSignIn().catch((e) => useLive.setState({ error: e.message }))
    const user = await remote.currentUser()
    if (user) await onSignedIn(user)
  } catch (e) {
    useLive.setState({ error: e instanceof Error ? e.message : 'Couldn’t connect' })
  } finally {
    useLive.setState({ ready: true })
  }
  window.addEventListener('focus', () => {
    if (!uid || Date.now() - lastFocus < 30e3 || pending) return
    lastFocus = Date.now()
    void reload().catch(() => {})
  })
}

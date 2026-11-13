import type { Data, HallEntry, ID, Listen, NmaCategory, Nomination, Privacy, Rating, User } from '../types'
import { alid, albums, artists, tid, trackList, tracks } from './catalog'

export const DAY = 864e5
export const HOUR = 36e5

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const uid = () => Math.random().toString(36).slice(2, 10)

type Tastes = Record<string, number>
const TRENDING = ['luther', 'Juna', 'DENIAL IS A RIVER', "That's So True"].map(tid)
const HITS: Record<ID, number> = Object.fromEntries(
  ['Espresso', 'luther', 'BIRDS OF A FEATHER', 'tv off', 'Kill Bill', 'Stick Season', 'Pink Pony Club', 'Dreams'].map((t) => [tid(t), 1.6]),
)

export const ME_TASTES: Tastes = { indie: 1, 'r&b': 0.8, pop: 0.55, folk: 0.4 }

/** Generate plausible listening history for one user, skewed toward recent days. */
export function genListens(userId: ID, tastes: Tastes, n: number, rng: () => number, now: number): Listen[] {
  const affinity: Record<ID, number> = {}
  for (const t of trackList) affinity[t.id] = 0.3 + rng() * rng() * 3
  const out: Listen[] = []
  for (let i = 0; i < n; i++) {
    const at = now - Math.pow(rng(), 2.2) * 60 * DAY - rng() * 20 * 60e3
    const recent = now - at < 7 * DAY
    let total = 0
    const w = trackList.map((t) => {
      const g = tastes[artists[t.artistId].genre] ?? 0.12
      const v = g * affinity[t.id] * (HITS[t.id] ?? 1) * (recent && TRENDING.includes(t.id) ? 3.5 : 1)
      total += v
      return v
    })
    let r = rng() * total
    let pick = 0
    for (; pick < w.length - 1; pick++) { r -= w[pick]; if (r <= 0) break }
    out.push({ id: `${userId}-l${i}-${Math.floor(at)}`, userId, trackId: trackList[pick].id, at })
  }
  return out
}

const REVIEWS = [
  'no skips.', 'the bridge alone deserves a Golden Bulldog', 'bus ride essential', 'overplayed but it still hits',
  'had this on the whole way to Dedham', 'study hall soundtrack', 'grew on me after the third listen', 'production is unreal',
  'windows down, volume up', 'crying in the Castle (affectionate)', '', '', '',
]

const U = (id: ID, name: string, classYear: number, color: string, bio: string, privacy: Privacy, favs: string[], extra: Partial<User> = {}): User => {
  const [first, last] = name.split(' ')
  const handle = (first[0] + last).toLowerCase() + String(classYear).slice(2)
  return {
    id, name, handle, email: `${handle}@nobles.edu`, classYear, color, bio, privacy, sharingPaused: false, leaderboardOptIn: true,
    spotify: true, apple: false, favoriteAlbums: favs.map(alid), badges: [], ...extra,
  }
}

const PEOPLE: [User, Tastes][] = [
  [U('u1', 'Maya Okafor', 2027, '#7c5cff', 'indie girl autumn, year-round', 'school', ['Punisher', 'Charm', 'Blonde'], { nowPlaying: tid('Juna'), badges: ['Called It', 'Voter'] }), { indie: 1, 'r&b': 0.7, folk: 0.3 }],
  [U('u2', 'Liam Brennan', 2027, '#c4441b', 'aux cord privileges: earned', 'school', ['GNX', 'Swimming', 'ASTROWORLD'], { badges: ['Called It', 'Nominator'] }), { 'hip-hop': 1, 'r&b': 0.4 }],
  [U('u3', 'Sofia Reyes', 2028, '#c2315f', 'pop is a serious genre', 'school', ["Short n' Sweet", 'GUTS', 'folklore'], { nowPlaying: tid('Espresso'), badges: ['Called It'] }), { pop: 1, hyperpop: 0.4 }],
  [U('u4', 'Ethan Park', 2028, '#17705a', 'guitar music isn’t dead', 'friends', ['AM', 'Currents', 'Rumours']), { rock: 1, indie: 0.6, classic: 0.4 }],
  [U('u5', 'Chloe Whitman', 2027, '#a66f0c', 'stick season is a lifestyle', 'school', ['Stick Season', 'folklore', 'For Emma, Forever Ago'], { badges: ['Called It'] }), { folk: 1, pop: 0.5, indie: 0.3 }],
  [U('u6', 'Noah Feldman', 2029, '#2b6fe2', 'game day playlist curator', 'school', ['CHROMAKOPIA', 'GNX', 'SOS'], { apple: true, spotify: false }), { 'hip-hop': 0.9, 'r&b': 0.7 }],
  [U('u7', 'Ava Lindqvist', 2028, '#6f8f14', 'brat summer never ended', 'school', ['BRAT', 'HIT ME HARD AND SOFT']), { hyperpop: 1, pop: 0.7 }],
  [U('u8', 'Jackson Tran', 2027, '#8a6a4f', 'my dad’s record collection', 'friends', ['Rumours', 'Speakerboxxx/The Love Below']), { classic: 1, rock: 0.7 }],
  [U('u9', 'Priya Desai', 2029, '#b136a8', 'r&b for studying, r&b for everything', 'school', ['SOS', 'Freudian', 'Blonde']), { 'r&b': 1, pop: 0.5 }],
  [U('u10', 'Owen Gallagher', 2030, '#4f7a3a', 'new here. send folk.', 'school', ['American Heartbreak', 'Stick Season']), { folk: 1 }],
  [U('u11', 'Zoe Castellano', 2028, '#b3202e', 'it was never a phase', 'school', ['The Black Parade', 'Riot!', 'AM']), { emo: 1, rock: 0.7 }],
  [U('u12', 'Marcus Bell', 2027, '#555b66', '', 'private', ['Swimming'], { leaderboardOptIn: false }), { 'hip-hop': 1 }],
  [U('u13', 'Hannah Sato', 2029, '#1f7f91', 'looking up (mk.gee reference)', 'school', ['Two Star & The Dream Police', 'This Is How Tomorrow Moves', 'Pure Heroine']), { indie: 1, folk: 0.3 }],
  [U('u14', 'Theo Abrams', 2030, '#6b4fd9', 'freshman with opinions', 'school', ['GNX', 'GUTS'], { sharingPaused: true }), { pop: 0.7, 'hip-hop': 0.7 }],
]

export const DEFAULT_CATEGORIES: NmaCategory[] = [
  { id: 'soty', name: 'Song of the Year', type: 'track', emoji: '🏆', active: true },
  { id: 'aoty', name: 'Album of the Year', type: 'album', emoji: '💿', active: true },
  { id: 'discovery', name: 'Best New Discovery', type: 'track', emoji: '🔭', active: true },
  { id: 'underrated', name: 'Most Underrated', type: 'track', emoji: '💎', active: true },
  { id: 'study', name: 'Best Study Song', type: 'track', emoji: '📚', active: true },
  { id: 'gameday', name: 'Best Game Day Song', type: 'track', emoji: '🏟️', active: true },
  { id: 'bus', name: 'Best Bus Ride Song', type: 'track', emoji: '🚌', active: true },
  { id: 'breakup', name: 'Best Breakup Song', type: 'track', emoji: '💔', active: true },
  { id: 'throwback', name: 'Best Throwback', type: 'track', emoji: '📼', active: true },
]

const CANDIDATES: Record<ID, ID[]> = {
  soty: ['Espresso', 'BIRDS OF A FEATHER', 'tv off', 'Juna', 'Pink Pony Club', "That's So True"].map(tid),
  aoty: ['GNX', 'BRAT', 'Charm', 'HIT ME HARD AND SOFT', 'CHROMAKOPIA'].map(alid),
  discovery: ['DENIAL IS A RIVER', 'Are You Looking Up', 'Take a Bite', 'Sexy to Someone', 'Risk'].map(tid),
  underrated: ['Like Him', 'CHIHIRO', 'I Know the End', '2009', 'Apple'].map(tid),
  study: ['Skinny Love', 'Pink + White', 'Ribs', 'Best Part', 'cardigan'].map(tid),
  gameday: ['SICKO MODE', 'squabble up', 'tv off', '360', 'R U Mine?'].map(tid),
  bus: ['Stick Season', 'Northern Attitude', 'august', 'Dreams', 'Something in the Orange'].map(tid),
  breakup: ['vampire', 'Kill Bill', 'Please Please Please', 'Snooze', 'Nights'].map(tid),
  throwback: ['Hey Ya!', 'Misery Business', 'Welcome to the Black Parade', 'The Chain', 'Blinding Lights'].map(tid),
}

export function seedNominations(now: number, rng = mulberry32(77)): Nomination[] {
  const out: Nomination[] = []
  for (const c of DEFAULT_CATEGORIES) {
    const cands = CANDIDATES[c.id]
    // Top leaderboard songs are auto-nominated where it fits.
    if (c.id === 'soty') cands.slice(0, 2).forEach((itemId, i) => out.push({ id: `auto-${i}`, categoryId: c.id, itemId, userId: 'auto', at: now - 6 * DAY }))
    PEOPLE.forEach(([u], i) => {
      if (rng() < 0.2) return
      const idx = Math.min(cands.length - 1, Math.floor(Math.pow(rng(), 1.6) * cands.length))
      out.push({ id: `n-${c.id}-${u.id}`, categoryId: c.id, itemId: cands[idx], userId: u.id, at: now - (5 - i * 0.3) * DAY })
    })
  }
  return out
}

export function buildSeed(now = Date.now()): Data {
  const rng = mulberry32(20261112)
  const users: Record<ID, User> = {
    me: {
      id: 'me', name: 'You', handle: 'you', email: '', classYear: 2027, color: '#0b3b8c', bio: 'passing the aux', privacy: 'school',
      sharingPaused: false, leaderboardOptIn: true, spotify: false, apple: false, favoriteAlbums: ['Punisher', 'Blonde', 'Charm'].map(alid), badges: [],
    },
  }
  let listens: Listen[] = []
  const ratings: Rating[] = []
  for (const [u, tastes] of PEOPLE) {
    users[u.id] = u
    const ls = genListens(u.id, tastes, 90 + Math.floor(rng() * 50), rng, now)
    listens = listens.concat(ls)
    const counts: Record<ID, number> = {}
    ls.forEach((l) => (counts[l.trackId] = (counts[l.trackId] ?? 0) + 1))
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 5)
    top.forEach((trackId, i) => {
      const stars = [5, 4.5, 4, 4.5, 3.5][i] - (rng() < 0.25 ? 0.5 : 0)
      ratings.push({ id: `r-${u.id}-${i}`, userId: u.id, itemType: 'track', itemId: trackId, stars, review: REVIEWS[Math.floor(rng() * REVIEWS.length)], at: now - Math.pow(rng(), 2) * 12 * DAY - HOUR })
    })
    u.favoriteAlbums.slice(0, 2).forEach((albumId, i) => {
      ratings.push({ id: `ra-${u.id}-${i}`, userId: u.id, itemType: 'album', itemId: albumId, stars: i ? 4.5 : 5, review: i ? '' : REVIEWS[Math.floor(rng() * 10)], at: now - rng() * 20 * DAY - HOUR })
    })
  }
  listens.sort((a, b) => b.at - a.at)

  const follows: [ID, ID][] = []
  ;['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].forEach((id) => follows.push(['me', id]))
  ;['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u9', 'u13'].forEach((id) => follows.push([id, 'me']))
  PEOPLE.forEach(([u], i) => PEOPLE.forEach(([v], j) => { if (i !== j && rng() < 0.3) follows.push([u.id, v.id]) }))

  const hall: HallEntry[] = ([
    ['soty', 'luther', 'u2'], ['aoty', "Short n' Sweet", 'u3'], ['discovery', 'Are You Looking Up', 'u1'], ['underrated', 'Take a Bite', 'u13'],
    ['study', 'Pink + White', 'u9'], ['gameday', 'SICKO MODE', 'u6'], ['bus', 'Stick Season', 'u5'], ['breakup', 'Kill Bill', 'u7'], ['throwback', 'Dreams', 'u8'],
  ] as const).map(([cid, title, nom]) => {
    const c = DEFAULT_CATEGORIES.find((x) => x.id === cid)!
    return { id: `h-s26-${cid}`, season: 'Spring 2026', category: c.name, emoji: c.emoji, itemType: c.type, itemId: c.type === 'track' ? tid(title) : alid(title), nominatorId: nom }
  })

  const dailyTrack = tid('Juna')
  const dailyAlbum = alid('GNX')
  const lbl = (t: string) => `${tracks[tid(t)].title} — ${artists[tracks[tid(t)].artistId].name}`
  const albl = (t: string) => `${albums[alid(t)].title} — ${artists[albums[alid(t)].artistId].name}`
  const others = PEOPLE.map(([u]) => u.id)

  return {
    seededAt: now, signedIn: false, onboarded: false, theme: 'nobles', admin: true,
    users, follows, blocks: [], listens, ratings,
    recs: [
      { id: 'rec1', fromId: 'u1', toId: 'me', trackId: tid('Kyoto'), clipStart: 62, note: 'the horns at 1:02. trust.', at: now - 2 * HOUR },
      { id: 'rec2', fromId: 'u2', toId: 'me', trackId: tid('tv off'), clipStart: 118, note: 'you know which part', at: now - 9 * HOUR },
      { id: 'rec3', fromId: 'u3', toId: null, trackId: tid('Espresso'), clipStart: 44, note: 'still not over this chorus', at: now - 5 * HOUR },
      { id: 'rec4', fromId: 'u5', toId: null, trackId: tid('Northern Attitude'), clipStart: 150, note: 'bus ride home in november energy', at: now - 20 * HOUR },
      { id: 'rec5', fromId: 'u4', toId: 'me', trackId: tid('Do I Wanna Know?'), clipStart: 0, note: 'that riff.', at: now - 30 * HOUR },
      { id: 'rec6', fromId: 'u6', toId: null, trackId: tid('Sticky'), clipStart: 92, note: 'game day warmups', at: now - 40 * HOUR },
    ],
    comments: [
      { id: 'c1', userId: 'u1', targetId: `daily-${dailyTrack}`, text: 'finally some taste on this app', at: now - 3 * HOUR },
      { id: 'c2', userId: 'u13', targetId: `daily-${dailyTrack}`, text: 'the outro whistle lives in my head', at: now - 2 * HOUR },
      { id: 'c3', userId: 'u2', targetId: `daily-${dailyAlbum}`, text: 'no skips, don’t @ me', at: now - 4 * HOUR },
      { id: 'c4', userId: 'u6', targetId: `daily-${dailyAlbum}`, text: 'played this before every game this fall', at: now - HOUR },
    ],
    reactions: [
      ...['u1', 'u5', 'u9', 'u13', 'u4'].map((userId) => ({ userId, targetId: `daily-${dailyTrack}`, emoji: '🔥' })),
      ...['u3', 'u7'].map((userId) => ({ userId, targetId: `daily-${dailyTrack}`, emoji: '💙' })),
      ...['u2', 'u6', 'u14', 'u12'].map((userId) => ({ userId, targetId: `daily-${dailyAlbum}`, emoji: '🔥' })),
      { userId: 'u11', targetId: `daily-${dailyAlbum}`, emoji: '💀' },
      { userId: 'u1', targetId: 'rec3', emoji: '🔥' }, { userId: 'u7', targetId: 'rec3', emoji: '💙' },
    ],
    reports: [{ id: 'rp1', reporterId: 'u9', kind: 'comment', targetId: 'c3', reason: 'Spam', at: now - 2 * HOUR, status: 'open' }],
    daily: { mode: 'manual', metric: 'shared', trackId: dailyTrack, albumId: dailyAlbum },
    nma: {
      season: 'Fall 2026', phase: 'nominations', closesAt: now + 3 * DAY + 5 * HOUR,
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), nominations: seedNominations(now), votes: [],
      proposals: [
        { id: 'p1', userId: 'u11', name: 'Best Song to Cry to in the Library', status: 'open' },
        { id: 'p2', userId: 'u6', name: 'Best Locker Room Song', status: 'open' },
      ],
      ballot: {}, winners: {}, hall,
      flags: [
        { id: 'f1', text: '6 votes in “Song of the Year” within 40 seconds', detail: 'All from accounts created the same day. Possible coordinated voting.', status: 'open' },
        { id: 'f2', text: 'Duplicate sign-up attempt', detail: 'A second account was attempted for an email that is already registered (blocked automatically).', status: 'open' },
      ],
    },
    events: [
      {
        id: 'grammys27', name: '2027 GRAMMYs', note: 'Sample ballot — real nominees are entered in Admin', startsAt: now + 20 * DAY, locked: false,
        categories: [
          { id: 'roty', name: 'Record of the Year', nominees: ['luther', 'Espresso', 'BIRDS OF A FEATHER', '360'].map(lbl), winner: null },
          { id: 'aoty', name: 'Album of the Year', nominees: ['GNX', 'BRAT', "Short n' Sweet", 'CHROMAKOPIA'].map(albl), winner: null },
          { id: 'bna', name: 'Best New Artist', nominees: ['Doechii', 'Chappell Roan', 'Mk.gee', 'Gracie Abrams'], winner: null },
        ],
      },
      {
        id: 'demo26', name: 'Demo Awards Night', note: 'Sample event that has already been scored', startsAt: now - 30 * DAY, locked: true,
        categories: [
          { id: 'song', name: 'Song of the Summer', nominees: ['Espresso', 'Juna', 'tv off', 'Apple'].map(lbl), winner: lbl('Espresso') },
          { id: 'album', name: 'Best Album', nominees: ['Charm', 'GNX', 'BRAT'].map(albl), winner: albl('GNX') },
          { id: 'video', name: 'Best Video', nominees: ['Taste', 'DENIAL IS A RIVER', 'Sticky'].map(lbl), winner: lbl('DENIAL IS A RIVER') },
        ],
      },
    ],
    picks: (() => {
      const r = mulberry32(5)
      const cats = [['song', 4], ['album', 3], ['video', 3]] as const
      const noms = { song: ['Espresso', 'Juna', 'tv off', 'Apple'].map(lbl), album: ['Charm', 'GNX', 'BRAT'].map(albl), video: ['Taste', 'DENIAL IS A RIVER', 'Sticky'].map(lbl) }
      return others.flatMap((userId) => cats.map(([categoryId, n]) => ({ eventId: 'demo26', categoryId, userId, nominee: noms[categoryId][Math.floor(r() * n)] })))
    })(),
  }
}

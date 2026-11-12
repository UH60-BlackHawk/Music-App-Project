export type ID = string
export type Privacy = 'school' | 'friends' | 'private'
export type ThemeId = 'nobles' | 'sleek' | 'fantasy' | 'urban' | 'fleur' | 'hyperpop' | 'emo'
export type ItemType = 'track' | 'album'

export interface Artist { id: ID; name: string; genre: string }
export interface Album { id: ID; title: string; artistId: ID; year: number }
export interface Track { id: ID; title: string; artistId: ID; albumId: ID; dur: number }

export interface User {
  id: ID
  name: string
  handle: string
  email: string
  classYear: number
  color: string
  bio: string
  privacy: Privacy
  sharingPaused: boolean
  leaderboardOptIn: boolean
  spotify: boolean
  apple: boolean
  favoriteAlbums: ID[]
  badges: string[]
  nowPlaying?: ID
}

export interface Listen { id: ID; userId: ID; trackId: ID; at: number }
export interface Rating { id: ID; userId: ID; itemType: ItemType; itemId: ID; stars: number; review: string; at: number; hidden?: boolean }
/** A recommendation stores only the track id and clip start (seconds) — never audio. */
export interface Rec { id: ID; fromId: ID; toId: ID | null; trackId: ID; clipStart: number; note: string; at: number; hidden?: boolean }
export interface Comment { id: ID; userId: ID; targetId: ID; text: string; at: number; hidden?: boolean }
export interface Reaction { userId: ID; targetId: ID; emoji: string }
export interface Report { id: ID; reporterId: ID; kind: 'comment' | 'review' | 'user' | 'rec'; targetId: ID; reason: string; at: number; status: 'open' | 'removed' | 'dismissed' }
export interface DailyConfig { mode: 'manual' | 'auto'; metric: 'shared' | 'rated'; trackId: ID; albumId: ID }

export interface NmaCategory { id: ID; name: string; type: ItemType; emoji: string; active: boolean }
export interface Nomination { id: ID; categoryId: ID; itemId: ID; userId: ID; at: number }
export interface Vote { categoryId: ID; userId: ID; itemId: ID }
export interface Proposal { id: ID; userId: ID; name: string; status: 'open' | 'approved' | 'declined' }
export interface HallEntry { id: ID; season: string; category: string; emoji: string; itemType: ItemType; itemId: ID; nominatorId: ID | null }
export interface Flag { id: ID; text: string; detail: string; status: 'open' | 'cleared' | 'voided' }
export type NmaPhase = 'nominations' | 'voting' | 'reveal'
export interface Nma {
  season: string
  phase: NmaPhase
  closesAt: number
  categories: NmaCategory[]
  nominations: Nomination[]
  votes: Vote[]
  proposals: Proposal[]
  ballot: Record<ID, ID[]>
  winners: Record<ID, { itemId: ID; nominatorId: ID | null }>
  hall: HallEntry[]
  flags: Flag[]
}

export interface PredCategory { id: ID; name: string; nominees: string[]; winner: string | null }
export interface PredEvent { id: ID; name: string; note: string; startsAt: number; locked: boolean; categories: PredCategory[] }
export interface Pick { eventId: ID; categoryId: ID; userId: ID; nominee: string }

export interface QueueItem { id: ID; trackId: ID; addedBy: ID; votes: Record<ID, number> }
export interface Party { id: ID; name: string; hostId: ID; code: string; members: ID[]; queue: QueueItem[]; now: { trackId: ID; startedAt: number } | null }

export interface Data {
  seededAt: number
  signedIn: boolean
  onboarded: boolean
  theme: ThemeId
  admin: boolean
  users: Record<ID, User>
  follows: [ID, ID][]
  blocks: ID[]
  listens: Listen[]
  ratings: Rating[]
  recs: Rec[]
  comments: Comment[]
  reactions: Reaction[]
  reports: Report[]
  daily: DailyConfig
  nma: Nma
  events: PredEvent[]
  picks: Pick[]
  parties: Party[]
}

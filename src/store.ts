import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Data, ID, ItemType, NmaPhase, Privacy, Report, ThemeId, User } from './types'
import { buildSeed, DAY, genListens, ME_TASTES, mulberry32, seedNominations, uid } from './data/seed'
import { tid } from './data/catalog'

interface Actions {
  signIn(email: string, name: string, classYear: number): void
  signOut(): void
  finishOnboarding(): void
  resetDemo(): void
  setTheme(t: ThemeId): void
  setAdmin(on: boolean): void
  updateMe(patch: Partial<User>): void
  connect(): number
  disconnect(): void
  toggleFollow(id: ID): void
  block(id: ID): void
  unblock(id: ID): void
  rate(itemType: ItemType, itemId: ID, stars: number, review: string): void
  recommend(trackId: ID, toId: ID | null, clipStart: number, note: string): void
  comment(targetId: ID, text: string): void
  report(kind: Report['kind'], targetId: ID, reason: string): void
  resolveReport(id: ID, remove: boolean): void
  setDaily(patch: Partial<Data['daily']>): void
  nominate(categoryId: ID, itemId: ID): void
  vote(categoryId: ID, itemId: ID): void
  proposeCategory(name: string): void
  decideProposal(id: ID, approve: boolean): void
  addCategory(name: string, type: ItemType): void
  toggleCategory(id: ID): void
  setPhase(phase: NmaPhase): void
  resolveFlag(id: ID, status: 'cleared' | 'voided'): void
  pick(eventId: ID, categoryId: ID, nominee: string): void
  addNominee(eventId: ID, categoryId: ID, nominee: string): void
  setWinner(eventId: ID, categoryId: ID, nominee: string | null): void
  toggleLock(eventId: ID): void
}
export type Store = Data & Actions

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const me = (patch: Partial<User>) => set((s) => ({ users: { ...s.users, me: { ...s.users.me, ...patch } } }))
      const badge = (b: string) => { const u = get().users.me; if (!u.badges.includes(b)) me({ badges: [...u.badges, b] }) }
      return {
        ...buildSeed(),
        signIn: (email, name, classYear) => {
          const handle = email.split('@')[0].toLowerCase()
          me({ email: email.toLowerCase(), name, handle, classYear })
          set({ signedIn: true })
        },
        signOut: () => set({ signedIn: false }),
        finishOnboarding: () => set({ onboarded: true }),
        resetDemo: () => set({ ...buildSeed() }),
        setTheme: (theme) => set({ theme }),
        setAdmin: (admin) => set({ admin }),
        updateMe: me,
        connect: () => {
          const s = get()
          let added = 0
          if (!s.listens.some((l) => l.userId === 'me')) {
            // Mock import of "recently played" — a real provider would call services/spotify.ts here.
            const ls = genListens('me', ME_TASTES, 110, mulberry32(4242), Date.now())
            added = ls.length
            set({ listens: [...s.listens, ...ls].sort((a, b) => b.at - a.at) })
          }
          me({ spotify: true, nowPlaying: tid('Pink + White') })
          return added
        },
        disconnect: () => me({ spotify: false, nowPlaying: undefined }),
        toggleFollow: (id) => set((s) => {
          const on = s.follows.some((f) => f[0] === 'me' && f[1] === id)
          return { follows: on ? s.follows.filter((f) => !(f[0] === 'me' && f[1] === id)) : [...s.follows, ['me', id]] }
        }),
        block: (id) => set((s) => ({
          blocks: [...new Set([...s.blocks, id])],
          follows: s.follows.filter((f) => !((f[0] === 'me' && f[1] === id) || (f[0] === id && f[1] === 'me'))),
        })),
        unblock: (id) => set((s) => ({ blocks: s.blocks.filter((b) => b !== id) })),
        rate: (itemType, itemId, stars, review) => set((s) => ({
          ratings: [
            { id: uid(), userId: 'me', itemType, itemId, stars, review, at: Date.now() },
            ...s.ratings.filter((r) => !(r.userId === 'me' && r.itemType === itemType && r.itemId === itemId)),
          ],
        })),
        recommend: (trackId, toId, clipStart, note) => set((s) => ({ recs: [{ id: uid(), fromId: 'me', toId, trackId, clipStart, note, at: Date.now() }, ...s.recs] })),
        comment: (targetId, text) => set((s) => ({ comments: [...s.comments, { id: uid(), userId: 'me', targetId, text, at: Date.now() }] })),
        report: (kind, targetId, reason) => set((s) => ({ reports: [{ id: uid(), reporterId: 'me', kind, targetId, reason, at: Date.now(), status: 'open' }, ...s.reports] })),
        resolveReport: (id, remove) => set((s) => {
          const r = s.reports.find((x) => x.id === id)
          if (!r) return {}
          const reports = s.reports.map((x) => (x.id === id ? { ...x, status: remove ? ('removed' as const) : ('dismissed' as const) } : x))
          if (!remove) return { reports }
          return {
            reports,
            comments: r.kind === 'comment' ? s.comments.map((c) => (c.id === r.targetId ? { ...c, hidden: true } : c)) : s.comments,
            ratings: r.kind === 'review' ? s.ratings.map((c) => (c.id === r.targetId ? { ...c, hidden: true } : c)) : s.ratings,
            recs: r.kind === 'rec' ? s.recs.map((c) => (c.id === r.targetId ? { ...c, hidden: true } : c)) : s.recs,
          }
        }),
        setDaily: (patch) => set((s) => ({ daily: { ...s.daily, ...patch } })),

        // ---- Nobles Music Awards ----
        nominate: (categoryId, itemId) => {
          set((s) => ({
            nma: {
              ...s.nma,
              nominations: [...s.nma.nominations.filter((n) => !(n.userId === 'me' && n.categoryId === categoryId)), { id: uid(), categoryId, itemId, userId: 'me', at: Date.now() }],
            },
          }))
          badge('Nominator')
        },
        vote: (categoryId, itemId) => {
          // One vote per student per category; re-voting replaces the earlier vote until voting closes.
          set((s) => ({ nma: { ...s.nma, votes: [...s.nma.votes.filter((v) => !(v.userId === 'me' && v.categoryId === categoryId)), { categoryId, userId: 'me', itemId }] } }))
          badge('Voter')
        },
        proposeCategory: (name) => set((s) => ({ nma: { ...s.nma, proposals: [...s.nma.proposals, { id: uid(), userId: 'me', name, status: 'open' }] } })),
        decideProposal: (id, approve) => set((s) => {
          const p = s.nma.proposals.find((x) => x.id === id)
          if (!p) return {}
          return {
            nma: {
              ...s.nma,
              proposals: s.nma.proposals.map((x) => (x.id === id ? { ...x, status: approve ? ('approved' as const) : ('declined' as const) } : x)),
              categories: approve ? [...s.nma.categories, { id: uid(), name: p.name, type: 'track' as const, emoji: '✨', active: true }] : s.nma.categories,
            },
          }
        }),
        addCategory: (name, type) => set((s) => ({ nma: { ...s.nma, categories: [...s.nma.categories, { id: uid(), name, type, emoji: '✨', active: true }] } })),
        toggleCategory: (id) => set((s) => ({ nma: { ...s.nma, categories: s.nma.categories.map((c) => (c.id === id ? { ...c, active: !c.active } : c)) } })),
        setPhase: (phase) => {
          const s = get()
          const n = s.nma
          const cats = n.categories.filter((c) => c.active)
          const now = Date.now()
          if (phase === 'nominations') {
            const mine = n.nominations.filter((x) => x.userId === 'me')
            set({
              nma: { ...n, phase, closesAt: now + 3 * DAY, nominations: [...seedNominations(now), ...mine], votes: [], ballot: {}, winners: {}, hall: n.hall.filter((h) => h.season !== n.season) },
            })
          } else if (phase === 'voting') {
            const rng = mulberry32(99)
            const ballot: Record<ID, ID[]> = {}
            const votes = n.votes.filter((v) => v.userId === 'me')
            for (const c of cats) {
              const counts: Record<ID, number> = {}
              n.nominations.filter((x) => x.categoryId === c.id).forEach((x) => (counts[x.itemId] = (counts[x.itemId] ?? 0) + 1))
              ballot[c.id] = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 4)
              if (!ballot[c.id].length) continue
              // Simulated classmates voting (prototype only).
              Object.keys(s.users).filter((u) => u !== 'me').forEach((userId) => {
                const i = Math.min(ballot[c.id].length - 1, Math.floor(Math.pow(rng(), 1.5) * ballot[c.id].length))
                votes.push({ categoryId: c.id, userId, itemId: ballot[c.id][i] })
              })
            }
            set({ nma: { ...n, phase, closesAt: now + 2 * DAY, ballot, votes: votes.filter((v) => ballot[v.categoryId]?.includes(v.itemId)), winners: {}, hall: n.hall.filter((h) => h.season !== n.season) } })
          } else {
            if (!Object.keys(n.ballot).length) { get().setPhase('voting'); return get().setPhase('reveal') }
            const winners: Data['nma']['winners'] = {}
            const hall = n.hall.filter((h) => h.season !== n.season)
            let calledIt = false
            for (const c of cats) {
              const b = n.ballot[c.id]
              if (!b?.length) continue
              const counts: Record<ID, number> = {}
              n.votes.filter((v) => v.categoryId === c.id).forEach((v) => (counts[v.itemId] = (counts[v.itemId] ?? 0) + 1))
              const itemId = [...b].sort((x, y) => (counts[y] ?? 0) - (counts[x] ?? 0))[0]
              const noms = n.nominations.filter((x) => x.categoryId === c.id && x.itemId === itemId && x.userId !== 'auto').sort((x, y) => x.at - y.at)
              const mine = noms.find((x) => x.userId === 'me')
              if (mine) calledIt = true
              const nominatorId = mine ? 'me' : noms[0]?.userId ?? null
              winners[c.id] = { itemId, nominatorId }
              hall.unshift({ id: `h-${n.season}-${c.id}`, season: n.season, category: c.name, emoji: c.emoji, itemType: c.type, itemId, nominatorId })
            }
            set({ nma: { ...n, phase, winners, hall } })
            if (calledIt) badge('Called It')
          }
        },
        resolveFlag: (id, status) => set((s) => ({ nma: { ...s.nma, flags: s.nma.flags.map((f) => (f.id === id ? { ...f, status } : f)) } })),

        // ---- Predictions (free virtual points only) ----
        pick: (eventId, categoryId, nominee) => set((s) => {
          const ev = s.events.find((e) => e.id === eventId)
          if (!ev || ev.locked || Date.now() >= ev.startsAt) return {}
          return { picks: [...s.picks.filter((p) => !(p.userId === 'me' && p.eventId === eventId && p.categoryId === categoryId)), { eventId, categoryId, userId: 'me', nominee }] }
        }),
        addNominee: (eventId, categoryId, nominee) => set((s) => ({
          events: s.events.map((e) => (e.id !== eventId ? e : { ...e, categories: e.categories.map((c) => (c.id !== categoryId ? c : { ...c, nominees: [...c.nominees, nominee] })) })),
        })),
        setWinner: (eventId, categoryId, winner) => set((s) => ({
          events: s.events.map((e) => (e.id !== eventId ? e : { ...e, categories: e.categories.map((c) => (c.id !== categoryId ? c : { ...c, winner })) })),
        })),
        toggleLock: (eventId) => set((s) => ({ events: s.events.map((e) => (e.id === eventId ? { ...e, locked: !e.locked } : e)) })),
      }
    },
    { name: 'aux-v1' },
  ),
)

export type { Privacy }

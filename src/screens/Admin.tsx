import { useState } from 'react'
import { useStore } from '../store'
import type { ItemType } from '../types'
import { albums, itemTitle, tracks } from '../data/catalog'
import { dailyPick } from '../lib/select'
import { Empty, Icon, Picker, Section, Seg, TopBar } from '../components/ui'

type Tab = 'daily' | 'nma' | 'pred' | 'mod'

export default function Admin() {
  const s = useStore()
  const [tab, setTab] = useState<Tab>('daily')
  const [pick, setPick] = useState<ItemType | null>(null)
  const [cat, setCat] = useState('')
  const [catType, setCatType] = useState<ItemType>('track')
  const [nominee, setNominee] = useState<Record<string, string>>({})
  if (!s.admin) return <><TopBar title="Admin" /><Empty>Admins only.</Empty></>
  const auto = dailyPick(s)
  const targetText = (kind: string, id: string) =>
    kind === 'comment' ? s.comments.find((c) => c.id === id)?.text
      : kind === 'review' ? s.ratings.find((r) => r.id === id)?.review
        : kind === 'rec' ? s.recs.find((r) => r.id === id)?.note
          : s.users[id]?.name
  const openReports = s.reports.filter((r) => r.status === 'open')

  return (
    <>
      <TopBar title="Admin dashboard" />
      <Seg options={[['daily', 'Daily'], ['nma', 'NMAs'], ['pred', 'Predictions'], ['mod', `Moderation${openReports.length ? ` (${openReports.length})` : ''}`]]} value={tab} onChange={setTab} />

      {tab === 'daily' && (
        <Section title="Song / Album of the Day">
          <div className="card stack">
            <Seg options={[['manual', 'Manual pick'], ['auto', 'Automatic']]} value={s.daily.mode} onChange={(mode) => s.setDaily({ mode })} />
            {s.daily.mode === 'manual' ? (
              <>
                <div className="toggle-row"><span><b>Song</b><small>{tracks[s.daily.trackId].title}</small></span><button className="btn sm" onClick={() => setPick('track')}>Change</button></div>
                <div className="toggle-row"><span><b>Album</b><small>{albums[s.daily.albumId].title}</small></span><button className="btn sm" onClick={() => setPick('album')}>Change</button></div>
              </>
            ) : (
              <>
                <Seg options={[['shared', 'Most shared (24h)'], ['rated', 'Highest rated (24h)']]} value={s.daily.metric} onChange={(metric) => s.setDaily({ metric })} />
                <p className="fine">Right now: <b>{tracks[auto.trackId].title}</b> and <b>{albums[auto.albumId].title}</b>.</p>
              </>
            )}
          </div>
          <Picker open={!!pick} type={pick ?? 'track'} onClose={() => setPick(null)} onPick={(id) => s.setDaily(pick === 'track' ? { trackId: id } : { albumId: id })} />
        </Section>
      )}

      {tab === 'nma' && (
        <>
          <Section title="Season phase" kicker={s.nma.season}>
            <div className="card stack">
              <Seg options={[['nominations', 'Nominations'], ['voting', 'Voting'], ['reveal', 'Reveal']]} value={s.nma.phase} onChange={s.setPhase} />
              <p className="fine">Moving to Voting builds the ballot from the most-nominated entries. Moving to Reveal tallies votes and awards Golden Bulldogs. Results are never shown before the reveal.</p>
            </div>
          </Section>
          <Section title="Categories">
            <div className="card stack">
              {s.nma.categories.map((c) => (
                <div className="toggle-row" key={c.id}>
                  <span><b className="with-icon"><Icon name={c.icon} size={16} /> {c.name}</b><small>{c.type === 'track' ? 'Song' : 'Album'} · {c.active ? 'active' : 'retired'}</small></span>
                  <button className="btn sm" onClick={() => s.toggleCategory(c.id)}>{c.active ? 'Retire' : 'Restore'}</button>
                </div>
              ))}
              <form className="comment-form" onSubmit={(e) => { e.preventDefault(); if (cat.trim()) { s.addCategory(cat.trim(), catType); setCat('') } }}>
                <input placeholder="New category name" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="New category" />
                <select value={catType} onChange={(e) => setCatType(e.target.value as ItemType)} aria-label="Type"><option value="track">Song</option><option value="album">Album</option></select>
                <button className="btn primary sm">Add</button>
              </form>
            </div>
          </Section>
          <Section title="Student proposals">
            <div className="card stack">
              {s.nma.proposals.filter((p) => p.status === 'open').map((p) => (
                <div className="toggle-row" key={p.id}>
                  <span><b>{p.name}</b><small>from {s.users[p.userId]?.name}</small></span>
                  <span className="btn-pair"><button className="btn sm primary" onClick={() => s.decideProposal(p.id, true)}>Approve</button><button className="btn sm" onClick={() => s.decideProposal(p.id, false)}>Decline</button></span>
                </div>
              ))}
              {!s.nma.proposals.some((p) => p.status === 'open') && <Empty>No open proposals.</Empty>}
            </div>
          </Section>
          <Section title="Voting integrity" kicker="Suspicious activity">
            <div className="card stack">
              {s.nma.flags.map((f) => (
                <div className="toggle-row" key={f.id}>
                  <span><b>{f.text}</b><small>{f.detail}</small></span>
                  {f.status === 'open'
                    ? <span className="btn-pair"><button className="btn sm" onClick={() => s.resolveFlag(f.id, 'cleared')}>Clear</button><button className="btn sm danger" onClick={() => s.resolveFlag(f.id, 'voided')}>Void votes</button></span>
                    : <span className="pill">{f.status}</span>}
                </div>
              ))}
              <p className="fine">One account per school email · one vote per category · {s.nma.votes.length} votes cast this season.</p>
            </div>
          </Section>
        </>
      )}

      {tab === 'pred' && s.events.map((ev) => (
        <Section title={ev.name} key={ev.id} action={<button className="btn sm" onClick={() => s.toggleLock(ev.id)}>{ev.locked ? 'Unlock picks' : 'Lock picks'}</button>}>
          <div className="stack">
            {ev.categories.map((c) => (
              <div className="card stack" key={c.id}>
                <h3>{c.name}</h3>
                {c.nominees.map((n) => (
                  <div className="toggle-row" key={n}>
                    <span><b>{n}</b>{c.winner === n && <small>Winner</small>}</span>
                    <button className={`btn sm ${c.winner === n ? 'primary' : ''}`} onClick={() => s.setWinner(ev.id, c.id, c.winner === n ? null : n)}>{c.winner === n ? <><Icon name="check" size={14} /> Winner</> : 'Set winner'}</button>
                  </div>
                ))}
                <form className="comment-form" onSubmit={(e) => { e.preventDefault(); const v = nominee[ev.id + c.id]?.trim(); if (v) { s.addNominee(ev.id, c.id, v); setNominee({ ...nominee, [ev.id + c.id]: '' }) } }}>
                  <input placeholder="Add nominee" value={nominee[ev.id + c.id] ?? ''} onChange={(e) => setNominee({ ...nominee, [ev.id + c.id]: e.target.value })} aria-label="Add nominee" />
                  <button className="btn primary sm">Add</button>
                </form>
              </div>
            ))}
          </div>
        </Section>
      ))}

      {tab === 'mod' && (
        <Section title="Reports">
          <div className="stack">
            {s.reports.length ? s.reports.map((r) => (
              <div className="card stack" key={r.id}>
                <p><span className="pill">{r.kind}</span> <b>{r.reason}</b> <span className="muted">· reported by {r.reporterId === 'me' ? 'you' : s.users[r.reporterId]?.name}</span></p>
                <p className="note">“{targetText(r.kind, r.targetId) || itemTitle('track', r.targetId)}”</p>
                {r.status === 'open'
                  ? <span className="btn-pair">{r.kind !== 'user' && <button className="btn sm danger" onClick={() => s.resolveReport(r.id, true)}>Remove content</button>}<button className="btn sm" onClick={() => s.resolveReport(r.id, false)}>Dismiss</button></span>
                  : <span className="pill">{r.status}</span>}
              </div>
            )) : <Empty>No reports. Peaceful.</Empty>}
          </div>
        </Section>
      )}
    </>
  )
}

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import type { ID, NmaCategory, NmaPhase } from '../types'
import { itemArtist, itemTitle } from '../data/catalog'
import { DAY, HOUR } from '../data/seed'
import { moderate } from '../lib/select'
import { Trophy } from '../components/Brand'
import { Cover, Empty, Icon, Picker, Section, Seg } from '../components/ui'

const PHASES: [NmaPhase, string][] = [['nominations', 'Nominations'], ['voting', 'Voting'], ['reveal', 'Reveal']]
const closes = (at: number) => {
  const left = at - Date.now()
  const when = new Date(at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return left <= 0 ? `Closed ${when}` : `Closes ${when} · ${Math.floor(left / DAY)}d ${Math.floor((left % DAY) / HOUR)}h left`
}

function ItemLine({ c, id, right }: { c: NmaCategory; id: ID; right?: ReactNode }) {
  return (
    <span className="row">
      <span className="row-main">
        <Cover id={id} size={40} />
        <span className="row-text"><span className="row-title">{itemTitle(c.type, id)}</span><span className="row-sub">{itemArtist(c.type, id)}</span></span>
      </span>
      {right && <span className="row-right">{right}</span>}
    </span>
  )
}

function Nominations() {
  const s = useStore()
  const [pickFor, setPickFor] = useState<NmaCategory | null>(null)
  const [idea, setIdea] = useState('')
  const [err, setErr] = useState('')
  const cats = s.nma.categories.filter((c) => c.active)
  const propose = () => {
    const m = moderate(idea)
    if (!m.text) return
    if (!m.ok) return setErr(m.error!)
    s.proposeCategory(m.text); setIdea(''); setErr('')
  }
  return (
    <>
      <div className="stack">
        {cats.map((c) => {
          const noms = s.nma.nominations.filter((n) => n.categoryId === c.id)
          const mine = noms.find((n) => n.userId === 'me')
          const counts: Record<ID, number> = {}
          noms.forEach((n) => (counts[n.itemId] = (counts[n.itemId] ?? 0) + 1))
          const leading = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3)
          const auto = new Set(noms.filter((n) => n.userId === 'auto').map((n) => n.itemId))
          return (
            <div className="card stack" key={c.id}>
              <div className="cat-head"><span className="cat-emoji">{c.emoji}</span><h3>{c.name}</h3><span className="pill">{c.type === 'track' ? 'Song' : 'Album'}</span></div>
              {mine
                ? <ItemLine c={c} id={mine.itemId} right={<button className="btn sm" onClick={() => setPickFor(c)}>Change</button>} />
                : <button className="btn primary block" onClick={() => setPickFor(c)}><Icon name="plus" size={16} /> Nominate</button>}
              {leading.length > 0 && (
                <p className="fine">In the running: {leading.map((id, i) => <span key={id}>{i > 0 && ', '}<b>{itemTitle(c.type, id)}</b>{auto.has(id) && ' (auto-nominated from Charts)'}</span>)}</p>
              )}
            </div>
          )
        })}
      </div>
      <Section title="Propose a category">
        <form className="comment-form" onSubmit={(e) => { e.preventDefault(); propose() }}>
          <input placeholder="e.g. Best Song for the Walk to Assembly" value={idea} maxLength={60} onChange={(e) => setIdea(e.target.value)} aria-label="Category idea" />
          <button className="btn primary sm" disabled={!idea.trim()}>Propose</button>
        </form>
        {err && <p className="error">{err}</p>}
        <div className="chips">
          {s.nma.proposals.map((p) => <span key={p.id} className="chip static">{p.name}<b>{p.status === 'open' ? 'in review' : p.status}</b></span>)}
        </div>
      </Section>
      <Picker open={!!pickFor} type={pickFor?.type} title={pickFor ? `Nominate: ${pickFor.name}` : ''} onClose={() => setPickFor(null)} onPick={(id) => pickFor && s.nominate(pickFor.id, id)} />
    </>
  )
}

function Voting() {
  const s = useStore()
  const cats = s.nma.categories.filter((c) => c.active && s.nma.ballot[c.id]?.length)
  const myVotes = s.nma.votes.filter((v) => v.userId === 'me')
  const closed = Date.now() > s.nma.closesAt
  return (
    <div className="stack">
      <p className="banner static"><Icon name="lock" size={15} /> One vote per category. Results stay sealed until the reveal. <b>{myVotes.length}/{cats.length} voted</b></p>
      {cats.map((c) => {
        const mine = myVotes.find((v) => v.categoryId === c.id)?.itemId
        return (
          <div className="card stack" key={c.id}>
            <div className="cat-head"><span className="cat-emoji">{c.emoji}</span><h3>{c.name}</h3></div>
            {s.nma.ballot[c.id].map((id) => (
              <button key={id} className={`ballot ${mine === id ? 'on' : ''}`} disabled={closed} onClick={() => s.vote(c.id, id)} aria-pressed={mine === id}>
                <ItemLine c={c} id={id} right={<span className="tick">{mine === id && <Icon name="check" size={16} />}</span>} />
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Hall() {
  const hall = useStore((s) => s.nma.hall)
  const users = useStore((s) => s.users)
  const seasons = [...new Set(hall.map((h) => h.season))]
  return (
    <div className="stack">
      <div className="hall-head"><Icon name="castle" size={30} /><div><h2>The Castle Hall of Fame</h2><p className="muted">Every Golden Bulldog ever awarded.</p></div></div>
      {seasons.map((season) => (
        <Section title={season} key={season}>
          <div className="list">
            {hall.filter((h) => h.season === season).map((h) => (
              <Link className="hall-row" to={`/${h.itemType}/${h.itemId}`} key={h.id}>
                <Trophy size={30} />
                <Cover id={h.itemId} size={46} />
                <span className="row-text">
                  <span className="kicker">{h.emoji} {h.category}</span>
                  <span className="row-title">{itemTitle(h.itemType, h.itemId)}</span>
                  <span className="row-sub">{itemArtist(h.itemType, h.itemId)}{h.nominatorId && users[h.nominatorId] ? ` · nominated by ${users[h.nominatorId].name}` : ''}</span>
                </span>
              </Link>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

export default function Awards() {
  const s = useStore()
  const [tab, setTab] = useState<'now' | 'hall'>('now')
  const { phase } = s.nma
  const idx = PHASES.findIndex((p) => p[0] === phase)
  const next = PHASES[idx + 1]?.[0]
  return (
    <>
      <header className="pagehead awards-head">
        <div>
          <div className="kicker">The Noble Music Awards</div>
          <h1>{s.nma.season} NMAs</h1>
        </div>
        <Trophy size={54} />
      </header>
      <Seg options={[['now', 'This season'], ['hall', 'Hall of Fame']]} value={tab} onChange={setTab} />

      {tab === 'hall' ? <Hall /> : (
        <>
          <ol className="stepper">
            {PHASES.map(([p, label], i) => <li key={p} className={i < idx ? 'done' : i === idx ? 'on' : ''}><span>{i + 1}</span>{label}</li>)}
          </ol>
          {phase !== 'reveal' && <p className="fine center">{closes(s.nma.closesAt)}</p>}

          {s.admin && (
            <div className="adminbar">
              <Icon name="shield" size={15} /> <span>Admin</span>
              {next && <button className="btn sm" onClick={() => s.setPhase(next)}>Advance to {next}</button>}
              {phase !== 'nominations' && <button className="btn sm" onClick={() => s.setPhase('nominations')}>Restart season</button>}
            </div>
          )}

          {phase === 'nominations' && <Nominations />}
          {phase === 'voting' && <Voting />}
          {phase === 'reveal' && (
            <div className="card hero reveal-cta">
              <Trophy size={96} />
              <h2>The envelopes are sealed.</h2>
              <p className="muted">{Object.keys(s.nma.winners).length} Golden Bulldogs are about to find a home.</p>
              <Link className="btn primary big" to="/ceremony">Watch the ceremony</Link>
            </div>
          )}

          <Link to="/predictions" className="card promo">
            <Icon name="gem" size={28} />
            <span><b>Award Predictions</b><small>Call the GRAMMYs. Free points, bragging rights only.</small></span>
          </Link>

          <Section title="Your badges">
            <div className="chips">
              {s.users.me.badges.length ? s.users.me.badges.map((b) => <span key={b} className="chip static badge">🏅 {b}</span>) : <Empty>Nominate or vote to earn your first badge. Get “Called It” when your nomination wins.</Empty>}
            </div>
          </Section>
        </>
      )}
    </>
  )
}

/** Animated reveal: one category at a time, styled entirely by the active theme's tokens. */
export function Ceremony() {
  const s = useStore()
  const nav = useNavigate()
  const cats = useMemo(() => s.nma.categories.filter((c) => s.nma.winners[c.id]), [s.nma])
  const [i, setI] = useState(-1)
  const [stage, setStage] = useState<'drum' | 'show'>('drum')
  const c = cats[i]
  useEffect(() => {
    if (i < 0 || i >= cats.length) return
    setStage('drum')
    const t = setTimeout(() => setStage('show'), 2000)
    return () => clearTimeout(t)
  }, [i, cats.length])
  const confetti = useMemo(() => Array.from({ length: 36 }, (_, k) => ({ left: (k * 37) % 100, delay: (k % 9) * 0.12, dur: 2.2 + (k % 5) * 0.4, rot: (k * 53) % 360, c: k % 4 })), [])

  if (!cats.length)
    return <div className="ceremony"><Empty>No winners yet — an admin needs to move the season to Reveal.</Empty><button className="btn" onClick={() => nav('/awards')}>Back</button></div>

  // Portalled to <body>: the animated .screen wrapper would otherwise contain this fixed overlay.
  return createPortal(
    <div className="ceremony">
      <button className="iconbtn close" aria-label="Leave ceremony" onClick={() => nav('/awards')}><Icon name="x" /></button>
      {i < 0 && (
        <div className="cer-stage intro">
          <div className="kicker">Live from the Castle</div>
          <Trophy size={150} />
          <h1>The {s.nma.season}<br />Noble Music Awards</h1>
          <button className="btn primary big" onClick={() => setI(0)}>Begin</button>
        </div>
      )}
      {c && (
        <div className="cer-stage" key={c.id}>
          <div className="kicker">Award {i + 1} of {cats.length}</div>
          <h2 className="cer-cat">{c.emoji} {c.name}</h2>
          {stage === 'drum' ? (
            <div className="envelope" aria-label="Opening the envelope"><span>And the Golden Bulldog goes to…</span></div>
          ) : (
            <>
              <div className="confetti" aria-hidden="true">
                {confetti.map((p, k) => <i key={k} className={`c${p.c}`} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, transform: `rotate(${p.rot}deg)` }} />)}
              </div>
              <div className="winner">
                <div className="winner-trophy"><Trophy size={110} /></div>
                <Cover id={s.nma.winners[c.id].itemId} size={150} />
                <h1>{itemTitle(c.type, s.nma.winners[c.id].itemId)}</h1>
                <p className="detail-sub">{itemArtist(c.type, s.nma.winners[c.id].itemId)}</p>
                {s.nma.winners[c.id].nominatorId && (
                  <p className="pill big">{s.nma.winners[c.id].nominatorId === 'me' ? '🔮 You called it!' : `Nominated by ${s.users[s.nma.winners[c.id].nominatorId!]?.name}`}</p>
                )}
              </div>
              <button className="btn primary big" onClick={() => setI(i + 1)}>{i + 1 < cats.length ? 'Next award' : 'Finish'}</button>
            </>
          )}
        </div>
      )}
      {i >= cats.length && (
        <div className="cer-stage intro">
          <Trophy size={120} />
          <h1>That’s the show.</h1>
          <p className="muted">All {cats.length} winners now live in the Castle Hall of Fame.</p>
          <button className="btn primary big" onClick={() => nav('/awards')}>Back to the NMAs</button>
        </div>
      )}
    </div>,
    document.body,
  )
}

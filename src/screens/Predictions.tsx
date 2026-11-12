import { useState } from 'react'
import { useStore } from '../store'
import { POINTS_PER_PICK, predictionBoard } from '../lib/select'
import { Avatar, Icon, Section, Seg, TopBar } from '../components/ui'

export default function Predictions() {
  const s = useStore()
  const [eventId, setEventId] = useState(s.events[0]?.id ?? '')
  const ev = s.events.find((e) => e.id === eventId)
  const board = predictionBoard(s)
  if (!ev) return <TopBar title="Predictions" />
  const locked = ev.locked || Date.now() >= ev.startsAt
  const myPoints = board.find((b) => b.userId === 'me')?.points ?? 0

  return (
    <>
      <TopBar title="Predictions" />
      <Seg options={s.events.map((e) => [e.id, e.name] as [string, string])} value={eventId} onChange={setEventId} />
      <p className={`banner static ${locked ? '' : 'open'}`}>
        <Icon name={locked ? 'lock' : 'gem'} size={15} />
        {locked ? 'Picks are locked.' : `Picks lock when the show starts — ${new Date(ev.startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}.`}
        <b>{POINTS_PER_PICK} pts per correct pick</b>
      </p>
      <p className="fine center">{ev.note}. Points are free, just for fun — no money, nothing to buy.</p>

      <div className="stack">
        {ev.categories.map((c) => {
          const mine = s.picks.find((p) => p.userId === 'me' && p.eventId === ev.id && p.categoryId === c.id)?.nominee
          return (
            <div className="card stack" key={c.id}>
              <div className="cat-head"><h3>{c.name}</h3>{c.winner && mine && <span className={`pill ${mine === c.winner ? 'good' : ''}`}>{mine === c.winner ? `+${POINTS_PER_PICK}` : 'Missed'}</span>}</div>
              {c.nominees.map((n) => (
                <button key={n} className={`ballot text ${mine === n ? 'on' : ''} ${c.winner === n ? 'won' : ''}`} disabled={locked} onClick={() => s.pick(ev.id, c.id, n)} aria-pressed={mine === n}>
                  <span>{n}</span>
                  <span className="tick">{c.winner === n ? '🏆' : mine === n ? <Icon name="check" size={16} /> : null}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>

      <Section title="Prediction leaderboard" kicker={`You have ${myPoints} pts`}>
        <div className="list">
          {board.slice(0, 10).map((b, i) => (
            <div className="row" key={b.userId}>
              <span className="row-main">
                <span className="rank">{i + 1}</span>
                <Avatar user={s.users[b.userId]} size={36} />
                <span className="row-text"><span className="row-title">{b.userId === 'me' ? 'You' : s.users[b.userId].name}</span></span>
              </span>
              <span className="row-right plays">{b.points}<small>pts</small></span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

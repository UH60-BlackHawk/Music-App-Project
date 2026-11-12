import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { queueScore, useStore } from '../store'
import { artistOf, fmt, tracks } from '../data/catalog'
import { Avatar, Cover, Empty, Icon, OpenIn, Picker, Section, TopBar, TrackRow } from '../components/ui'

export function PartyList() {
  const s = useStore()
  const nav = useNavigate()
  const [name, setName] = useState('')
  return (
    <>
      <TopBar title="Listening Party" />
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); nav(`/party/${s.createParty(name.trim() || `${s.users.me.name.split(' ')[0]}’s aux`)}`) }}>
        <h2>Start a session</h2>
        <p className="muted">You host. Everyone adds songs and votes on what plays next.</p>
        <input className="input" placeholder="Name your party" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} aria-label="Party name" />
        <button className="btn primary block"><Icon name="headphones" size={17} /> Host a party</button>
      </form>
      <Section title="Live now">
        <div className="stack">
          {s.parties.length ? s.parties.map((p) => (
            <Link className="card party-card" to={`/party/${p.id}`} key={p.id} onClick={() => s.joinParty(p.id)}>
              {p.now ? <Cover id={p.now.trackId} size={56} /> : <span className="cover" style={{ width: 56, height: 56 }} />}
              <span className="row-text">
                <span className="row-title">{p.name}</span>
                <span className="row-sub">Hosted by {p.hostId === 'me' ? 'you' : s.users[p.hostId].name} · {p.members.length} listening</span>
                {p.now && <span className="row-sub"><span className="eq inline" aria-hidden="true"><i /><i /><i /></span> {tracks[p.now.trackId].title}</span>}
              </span>
              <span className="btn sm primary">{p.members.includes('me') ? 'Open' : 'Join'}</span>
            </Link>
          )) : <Empty>No parties right now. Start one.</Empty>}
        </div>
      </Section>
    </>
  )
}

export function PartyRoom() {
  const { id = '' } = useParams()
  const s = useStore()
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [, force] = useState(0)
  const p = s.parties.find((x) => x.id === id)

  useEffect(() => {
    const tick = setInterval(() => useStore.getState().partyTick(id), 3500)
    const clock = setInterval(() => force((n) => n + 1), 1000)
    return () => { clearInterval(tick); clearInterval(clock) }
  }, [id])

  if (!p) return <><TopBar title="Party" /><Empty>This party has ended.</Empty></>
  const host = p.hostId === 'me'
  const now = p.now ? tracks[p.now.trackId] : null
  const elapsed = p.now ? Math.min(now!.dur, (Date.now() - p.now.startedAt) / 1000) : 0
  const queue = [...p.queue].sort((a, b) => queueScore(b.votes) - queueScore(a.votes))

  return (
    <>
      <TopBar title={p.name} right={<button className="btn sm" onClick={() => { s.leaveParty(id); nav('/party') }}>{host ? 'End' : 'Leave'}</button>} />
      <div className="party-meta">
        <span className="members">{p.members.slice(0, 6).map((m) => <Avatar key={m} user={s.users[m]} size={28} />)}</span>
        <span className="muted">{p.members.length} listening · code <b className="mono">{p.code}</b></span>
      </div>

      <div className="card hero party-now">
        {now ? (
          <>
            <Cover id={now.id} size={150} />
            <div className="kicker"><span className="eq inline" aria-hidden="true"><i /><i /><i /></span> Now playing</div>
            <h2>{now.title}</h2>
            <p className="detail-sub">{artistOf(now).name}</p>
            <div className="progress"><span style={{ width: `${(elapsed / now.dur) * 100}%` }} /></div>
            <div className="progress-times mono"><span>{fmt(elapsed)}</span><span>{fmt(now.dur)}</span></div>
            <OpenIn track={now} />
          </>
        ) : <Empty>The queue is empty. Add the first song.</Empty>}
        {host && <button className="btn" onClick={() => s.nextTrack(id)} disabled={!p.queue.length}>Play next</button>}
      </div>

      <Section title="Up next" kicker="Top-voted plays first" action={<button className="btn primary sm" onClick={() => setAdding(true)}><Icon name="plus" size={15} /> Add song</button>}>
        <div className="list">
          {queue.length ? queue.map((q) => (
            <TrackRow
              key={q.id} track={tracks[q.trackId]} onClick={() => {}}
              sub={<>{artistOf(tracks[q.trackId]).name} · added by {q.addedBy === 'me' ? 'you' : s.users[q.addedBy].name.split(' ')[0]}</>}
              right={
                <span className="votes">
                  <button className={`iconbtn ${q.votes.me === 1 ? 'on' : ''}`} aria-label="Upvote" onClick={() => s.voteQueue(id, q.id, 1)}><Icon name="up" size={18} /></button>
                  <b>{queueScore(q.votes)}</b>
                  <button className={`iconbtn ${q.votes.me === -1 ? 'on' : ''}`} aria-label="Downvote" onClick={() => s.voteQueue(id, q.id, -1)}><Icon name="down" size={18} /></button>
                </span>
              }
            />
          )) : <Empty>Nothing queued.</Empty>}
        </div>
      </Section>
      <p className="fine center">Prototype: other listeners are simulated. Playback runs in each person’s own Spotify or Apple Music.</p>
      <Picker open={adding} onClose={() => setAdding(false)} onPick={(tid) => s.addToQueue(id, tid)} title="Add to queue" />
    </>
  )
}

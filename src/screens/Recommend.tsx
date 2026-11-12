import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { tracks } from '../data/catalog'
import { following, moderate } from '../lib/select'
import { Avatar, ClipPicker, Icon, Picker, TopBar, TrackRow } from '../components/ui'

export default function Recommend() {
  const { id } = useParams()
  const nav = useNavigate()
  const s = useStore()
  const [trackId, setTrackId] = useState(id && tracks[id] ? id : '')
  const [picking, setPicking] = useState(!trackId)
  const [start, setStart] = useState(() => (trackId ? Math.round(tracks[trackId].dur * 0.3) : 0))
  const [to, setTo] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const t = tracks[trackId]
  const friends = following(s, 'me').map((f) => s.users[f])

  const send = () => {
    const m = moderate(note)
    if (!m.ok) return setErr(m.error!)
    s.recommend(trackId, to, start, m.text)
    setSent(true)
    setTimeout(() => nav('/'), 1100)
  }

  return (
    <>
      <TopBar title="Recommend a song" />
      <Picker open={picking} onClose={() => (trackId ? setPicking(false) : nav(-1))} onPick={(tid) => { setTrackId(tid); setStart(Math.round(tracks[tid].dur * 0.3)) }} />
      {t && (
        <div className="stack">
          <div className="card">
            <TrackRow track={t} right={<button className="btn sm" onClick={() => setPicking(true)}>Change</button>} onClick={() => setPicking(true)} />
          </div>

          <div className="card stack">
            <div><div className="kicker">Step 1</div><h2>Pick the best part</h2><p className="muted">Drag to choose the 30 seconds they have to hear.</p></div>
            <ClipPicker track={t} value={start} onChange={setStart} />
          </div>

          <div className="card stack">
            <div><div className="kicker">Step 2</div><h2>Who’s it for?</h2></div>
            <div className="chips">
              <button className={`chip who ${to === null ? 'on' : ''}`} onClick={() => setTo(null)}><Icon name="home" size={16} /> My feed</button>
              {friends.map((u) => (
                <button key={u.id} className={`chip who ${to === u.id ? 'on' : ''}`} onClick={() => setTo(u.id)}><Avatar user={u} size={20} /> {u.name.split(' ')[0]}</button>
              ))}
            </div>
          </div>

          <div className="card stack">
            <div><div className="kicker">Step 3</div><h2>Add a note <span className="muted">(optional)</span></h2></div>
            <textarea className="input" rows={2} maxLength={140} placeholder="why this one?" value={note} onChange={(e) => setNote(e.target.value)} />
            {err && <p className="error">{err}</p>}
          </div>

          <button className="btn primary block big" onClick={send} disabled={sent}>
            {sent ? <><Icon name="check" size={18} /> Sent</> : <><Icon name="send" size={18} /> {to ? `Send to ${s.users[to].name.split(' ')[0]}` : 'Post to feed'}</>}
          </button>
          <p className="fine center">Aux saves the song and a start time only. The clip plays through Spotify or Apple Music.</p>
        </div>
      )}
    </>
  )
}

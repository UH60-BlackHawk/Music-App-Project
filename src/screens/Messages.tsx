import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import type { Rec } from '../types'
import { artistOf, tracks } from '../data/catalog'
import { isFollowing, moderate, shareContacts, thread, threads, timeAgo } from '../lib/select'
import { Avatar, ClipPlayer, Cover, Empty, Icon, OpenIn, Picker, QuickRate, ReportButton, Sheet, TopBar } from '../components/ui'
import { ShareButton } from '../components/Share'

const first = (name: string) => name.split(' ')[0]

export function MessagesList() {
  const s = useStore()
  const nav = useNavigate()
  const [composing, setComposing] = useState(false)
  const list = useMemo(() => threads(s), [s.recs, s.blocks, s.users])
  const contacts = useMemo(() => shareContacts(s), [s.recs, s.follows, s.blocks, s.users])
  return (
    <>
      <TopBar title="Messages" right={<button className="iconbtn" aria-label="New message" onClick={() => setComposing(true)}><Icon name="pen" /></button>} />
      <p className="fine">Songs only. Every message is a song, with an optional note.</p>
      <div className="list threads">
        {list.length ? list.map((t) => {
          const u = s.users[t.userId]
          const tr = tracks[t.last.trackId]
          const mine = t.last.fromId === 'me'
          return (
            <Link key={t.userId} to={`/messages/${t.userId}`} className={`thread-row ${t.unread ? 'unread' : ''}`}>
              <Avatar user={u} size={50} />
              <span className="row-text">
                <span className="row-title">{u.name}</span>
                <span className="row-sub">{mine ? 'You sent' : 'Sent'} {tr.title}{t.last.note ? ` · “${t.last.note}”` : ''}</span>
              </span>
              <span className="thread-meta">
                <small>{timeAgo(t.last.at)}</small>
                {t.unread > 0 && <span className="badge" aria-label={`${t.unread} unread`}>{t.unread}</span>}
              </span>
            </Link>
          )
        }) : <Empty>No messages yet. Tap the pen to send someone a song.</Empty>}
      </div>

      <Sheet open={composing} onClose={() => setComposing(false)} title="New message">
        <div className="list">
          {contacts.map((id) => (
            <button key={id} className="row row-main" onClick={() => { setComposing(false); nav(`/messages/${id}`) }}>
              <Avatar user={s.users[id]} size={42} />
              <span className="row-text"><span className="row-title">{s.users[id].name}</span><span className="row-sub">@{s.users[id].handle}{isFollowing(s, id, 'me') ? ' · follows you' : ''}</span></span>
            </button>
          ))}
          {!contacts.length && <Empty>Follow classmates to message them.</Empty>}
        </div>
      </Sheet>
    </>
  )
}

function Bubble({ rec }: { rec: Rec }) {
  const t = tracks[rec.trackId]
  const mine = rec.fromId === 'me'
  return (
    <div className={`bubble-row ${mine ? 'mine' : ''}`}>
      <div className="bubble">
        <Link to={`/track/${t.id}`} className="bubble-song">
          <Cover id={t.id} size={54} />
          <span className="row-text"><span className="row-title">{t.title}</span><span className="row-sub">{artistOf(t).name}</span></span>
        </Link>
        {rec.note && <p className="bubble-note">{rec.note}</p>}
        {rec.clipStart !== null && (<><div className="kicker">The best part</div><ClipPlayer track={t} start={rec.clipStart} /></>)}
        <div className="bubble-foot">
          {mine ? <OpenIn track={t} /> : <QuickRate type="track" id={t.id} />}
          <span className="bubble-tools">
            <ShareButton trackId={t.id} />
            {!mine && <ReportButton kind="rec" targetId={rec.id} />}
          </span>
        </div>
      </div>
      <small className="bubble-time">{timeAgo(rec.at)}</small>
    </div>
  )
}

export function MessageThread() {
  const { id = '' } = useParams()
  const s = useStore()
  const [picking, setPicking] = useState(false)
  const [trackId, setTrackId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const u = s.users[id]
  const msgs = useMemo(() => (u ? thread(s, id) : []), [s.recs, id])
  const unread = msgs.filter((r) => r.toId === 'me' && !r.read).length

  useEffect(() => { if (unread) s.markThreadRead(id) }, [unread, id])
  // Deferred so it runs after the app's scroll-to-top on navigation: a chat opens at the latest message.
  useEffect(() => {
    const timer = setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight }), 30)
    return () => clearTimeout(timer)
  }, [msgs.length, id])

  if (!u || id === 'me') return <><TopBar title="Messages" /><Empty>Conversation not found.</Empty></>
  const blocked = s.blocks.includes(id)
  const send = () => {
    if (!trackId) return
    const m = moderate(note)
    if (!m.ok) return setErr(m.error!)
    s.share(trackId, [id], m.text)
    setTrackId(null); setNote(''); setErr('')
  }

  return (
    <>
      <TopBar title={u.name} right={<Link to={`/profile/${id}`} aria-label={`${u.name}'s profile`}><Avatar user={u} size={32} /></Link>} />
      <div className="thread">
        {msgs.length ? msgs.map((r) => <Bubble key={r.id} rec={r} />) : (
          <div className="thread-empty"><Avatar user={u} size={72} /><b>{u.name}</b><p className="muted">Send {first(u.name)} a song to start the conversation.</p></div>
        )}
      </div>

      {createPortal(
        <div className="composer">
          {blocked ? (
            <p className="muted center">You blocked {first(u.name)}. <button className="btn sm" onClick={() => s.unblock(id)}>Unblock</button></p>
          ) : trackId ? (
            <>
              <div className="composer-song">
                <Cover id={trackId} size={40} />
                <span className="row-text"><span className="row-title">{tracks[trackId].title}</span><span className="row-sub">{artistOf(tracks[trackId]).name}</span></span>
                <button className="iconbtn" aria-label="Remove song" onClick={() => setTrackId(null)}><Icon name="x" size={18} /></button>
              </div>
              <form className="comment-form" onSubmit={(e) => { e.preventDefault(); send() }}>
                <input autoFocus placeholder="Add a note (optional)" maxLength={140} value={note} onChange={(e) => { setNote(e.target.value); setErr('') }} aria-label="Note" />
                <button className="btn primary sm"><Icon name="send" size={15} /> Send</button>
              </form>
              {err && <p className="error">{err}</p>}
            </>
          ) : (
            <button className="btn primary block" onClick={() => setPicking(true)}><Icon name="search" size={17} /> Send a song</button>
          )}
        </div>,
        document.body,
      )}
      <Picker open={picking} onClose={() => setPicking(false)} onPick={setTrackId} title={`Send ${first(u.name)} a song`} />
    </>
  )
}

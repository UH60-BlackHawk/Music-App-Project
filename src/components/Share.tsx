import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ID } from '../types'
import { artistOf, spotifyLink, tracks } from '../data/catalog'
import { useStore } from '../store'
import { isFollowing, moderate, shareContacts } from '../lib/select'
import { Avatar, Cover, Icon, Sheet } from './ui'

const first = (name: string) => name.split(' ')[0]

/**
 * Share a song. Modelled on Instagram's Send sheet (tap several people, add a message, send)
 * with an Apple-style row of actions underneath (best part, post, copy link, Spotify, system share).
 * Each recipient gets their own direct message, which lands in Messages.
 */
export function ShareSheet({ trackId, open, onClose }: { trackId: ID; open: boolean; onClose: () => void }) {
  const s = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<ID[]>([])
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const t = tracks[trackId]
  const contacts = useMemo(() => shareContacts(s), [s.recs, s.follows, s.blocks, s.users])
  const ql = q.trim().toLowerCase()
  const shown = contacts.filter((id) => !ql || `${s.users[id].name} ${s.users[id].handle}`.toLowerCase().includes(ql))

  useEffect(() => {
    if (!open) { setQ(''); setPicked([]); setNote(''); setErr(''); setDone(null); setCopied(false) }
  }, [open])
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(onClose, 1800)
    return () => clearTimeout(timer)
  }, [done])

  if (!t) return null
  const toggle = (id: ID) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const names = picked.map((id) => first(s.users[id].name))
  const label = picked.length === 1 ? `Send to ${names[0]}` : `Send to ${picked.length} people`

  const send = () => {
    const m = moderate(note)
    if (!m.ok) return setErr(m.error!)
    s.share(trackId, picked, m.text)
    setDone(picked.length === 1 ? `Sent to ${names[0]}` : `Sent to ${names[0]} and ${picked.length - 1} other${picked.length > 2 ? 's' : ''}`)
  }
  const postToFeed = () => { s.recommend(trackId, null, null, ''); setDone('Posted to your feed') }
  const link = `${location.origin}${location.pathname}#/track/${trackId}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { window.prompt('Copy this link', link) }
  }
  const systemShare = () => navigator.share?.({ title: `${t.title} — ${artistOf(t).name}`, text: `Listen to ${t.title} by ${artistOf(t).name} on Aux`, url: link }).catch(() => {})

  return (
    <Sheet open={open} onClose={onClose} title="Share">
      {done ? (
        <div className="share-done" role="status">
          <span className="share-done-tick"><Icon name="check" size={34} /></span>
          <b>{done}</b>
          {picked.length > 0 && <button className="btn sm" onClick={() => { onClose(); nav(picked.length === 1 ? `/messages/${picked[0]}` : '/messages') }}>View in Messages</button>}
        </div>
      ) : (
        <>
          <div className="share-song">
            <Cover id={trackId} size={52} />
            <span className="row-text"><span className="row-title">{t.title}</span><span className="row-sub">{artistOf(t).name}</span></span>
          </div>

          <label className="search"><Icon name="search" size={18} /><input placeholder="Search classmates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search classmates" /></label>

          <div className="share-grid" role="group" aria-label="Choose who to send to">
            {shown.map((id) => {
              const u = s.users[id]
              const on = picked.includes(id)
              return (
                <button key={id} className={`share-person ${on ? 'on' : ''}`} onClick={() => toggle(id)} aria-pressed={on}>
                  <span className="share-avatar">
                    <Avatar user={u} size={58} />
                    {on && <span className="share-check"><Icon name="check" size={14} /></span>}
                  </span>
                  <span className="share-name">{first(u.name)}</span>
                  <small>{isFollowing(s, id, 'me') ? 'follows you' : `’${String(u.classYear).slice(2)}`}</small>
                </button>
              )
            })}
            {!shown.length && <p className="empty">{contacts.length ? 'No one matches that search.' : 'Follow classmates to share songs with them.'}</p>}
          </div>

          {picked.length > 0 ? (
            <div className="share-send">
              <input className="input" placeholder="Write a message…" maxLength={140} value={note} onChange={(e) => { setNote(e.target.value); setErr('') }} aria-label="Message" />
              {err && <p className="error">{err}</p>}
              <button className="btn primary block big" onClick={send}><Icon name="send" size={17} /> {label}</button>
              {picked.length > 1 && <p className="fine center">Each person gets it in their own chat.</p>}
            </div>
          ) : (
            <div className="share-actions">
              <button onClick={() => { onClose(); nav(`/recommend/${trackId}`) }}><span><Icon name="star" /></span>Best part</button>
              <button onClick={postToFeed}><span><Icon name="home" /></span>Post to feed</button>
              <button onClick={copy}><span><Icon name={copied ? 'check' : 'link'} /></span>{copied ? 'Copied' : 'Copy link'}</button>
              <a href={spotifyLink(t)} target="_blank" rel="noreferrer"><span><Icon name="external" /></span>Spotify</a>
              {'share' in navigator && <button onClick={systemShare}><span><Icon name="share" /></span>More</button>}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

/** A paper-plane button that opens the share sheet for one song. */
export function ShareButton({ trackId, label, className = 'iconbtn' }: { trackId: ID; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={className} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }} aria-label={`Share ${tracks[trackId]?.title ?? 'song'}`}>
        <Icon name="send" size={label ? 16 : 18} />{label && ` ${label}`}
      </button>
      <ShareSheet trackId={trackId} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

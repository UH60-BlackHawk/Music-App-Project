import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import type { ID, ItemType, Rec, Track, User } from '../types'
import { albumList, albums, artistOf, artists, fmt, spotifyLink, trackList, tracks } from '../data/catalog'
import { useStore } from '../store'
import { moderate, timeAgo } from '../lib/select'
import { playClip, spotifyLive, stopClip } from '../services/spotify'

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  settings: 'M4 7h9M19 7h1M4 17h1M11 17h9M16 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4v16M17 4v16',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  plus: 'M12 5v14M5 12h14',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  lock: 'M8 11V8a4 4 0 0 1 8 0v3M6 11h12v9H6z',
  search: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM20 20l-4.5-4.5',
  headphones: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  castle: 'M4 21V9l2-1V5h2v2h2V5h4v2h2V5h2v3l2 1v12zM10 21v-5a2 2 0 0 1 4 0v5',
  gem: 'M12 21L3 9l4-5h10l4 5zM3 9h18M9 4l3 17 3-17',
  star: 'M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z',
}
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }

/** Generated cover art (no real artwork is bundled). Deterministic per album id. */
export function Cover({ id, size = 56, className = '' }: { id: ID; size?: number | string; className?: string }) {
  const albumId = tracks[id]?.albumId ?? id
  const title = albums[albumId]?.title ?? artists[id]?.name ?? '?'
  const h = hash(albumId)
  const hue = h % 360
  const hue2 = (hue + 40 + ((h >> 8) % 120)) % 360
  const pattern = (h >> 4) % 3
  const initials = title.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const bg =
    pattern === 0
      ? `radial-gradient(circle at 30% 25%, hsl(${hue2} 80% 70%), transparent 55%), linear-gradient(135deg, hsl(${hue} 65% 42%), hsl(${hue2} 60% 28%))`
      : pattern === 1
        ? `repeating-radial-gradient(circle at 50% 50%, hsl(${hue} 55% 24% / .5) 0 2px, transparent 2px 9px), linear-gradient(160deg, hsl(${hue} 70% 55%), hsl(${hue2} 70% 35%))`
        : `conic-gradient(from ${hue}deg at 70% 70%, hsl(${hue} 70% 50%), hsl(${hue2} 75% 62%), hsl(${hue} 60% 30%), hsl(${hue} 70% 50%))`
  return (
    <div className={`cover ${className}`} style={{ width: size, height: typeof size === 'number' ? size : undefined, background: bg, fontSize: typeof size === 'number' ? size * 0.3 : 44 }} aria-label={`${title} cover`}>
      <span>{initials}</span>
    </div>
  )
}

export function Avatar({ user, size = 36 }: { user: User; size?: number }) {
  const initials = user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return <span className="avatar" style={{ width: size, height: size, background: user.color, fontSize: size * 0.38 }}>{initials}</span>
}
export function UserLink({ user, children }: { user: User; children?: ReactNode }) {
  return <Link className="userlink" to={`/profile/${user.id}`}>{children ?? user.name}</Link>
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${value} out of 5 stars`}>
      ★★★★★<span className="stars-fill" style={{ width: `${(value / 5) * 100}%` }}>★★★★★</span>
    </span>
  )
}
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="stars star-input" role="slider" aria-label="Your rating" aria-valuemin={0.5} aria-valuemax={5} aria-valuenow={value}>
      ★★★★★<span className="stars-fill" style={{ width: `${(value / 5) * 100}%` }}>★★★★★</span>
      <span className="star-hit">
        {Array.from({ length: 10 }, (_, i) => (
          <button key={i} aria-label={`${(i + 1) / 2} stars`} onClick={() => onChange((i + 1) / 2)} />
        ))}
      </span>
    </span>
  )
}

export function Seg<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

export function Section({ title, kicker, action, children }: { title: string; kicker?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="topbar">
      <button className="iconbtn" aria-label="Back" onClick={() => nav(-1)}><Icon name="back" /></button>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  )
}

export function TrackRow({ track, sub, right, rank, onClick }: { track: Track; sub?: ReactNode; right?: ReactNode; rank?: number; onClick?: () => void }) {
  const body = (
    <>
      {rank !== undefined && <span className="rank">{rank}</span>}
      <Cover id={track.id} size={46} />
      <span className="row-text">
        <span className="row-title">{track.title}</span>
        <span className="row-sub">{sub ?? artistOf(track).name}</span>
      </span>
    </>
  )
  return (
    <div className="row">
      {onClick ? <button className="row-main" onClick={onClick}>{body}</button> : <Link className="row-main" to={`/track/${track.id}`}>{body}</Link>}
      {right && <span className="row-right">{right}</span>}
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  // Portalled to <body> so sheets escape themed containers (hero token overrides, backdrop-filter cards).
  return createPortal(
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Search-and-pick sheet for tracks or albums; reused by recommend, nominate, and admin flows. */
export function Picker({ open, onClose, onPick, type = 'track', title }: { open: boolean; onClose: () => void; onPick: (id: ID) => void; type?: ItemType; title?: string }) {
  const [q, setQ] = useState('')
  const ql = q.toLowerCase()
  return (
    <Sheet open={open} onClose={onClose} title={title ?? (type === 'track' ? 'Pick a song' : 'Pick an album')}>
      <label className="search"><Icon name="search" size={18} /><input autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="list">
        {type === 'track'
          ? trackList.filter((t) => `${t.title} ${artistOf(t).name}`.toLowerCase().includes(ql)).slice(0, 30).map((t) => (
              <TrackRow key={t.id} track={t} onClick={() => { onPick(t.id); onClose() }} />
            ))
          : albumList.filter((a) => `${a.title} ${artists[a.artistId].name}`.toLowerCase().includes(ql)).map((a) => (
              <div className="row" key={a.id}>
                <button className="row-main" onClick={() => { onPick(a.id); onClose() }}>
                  <Cover id={a.id} size={46} />
                  <span className="row-text"><span className="row-title">{a.title}</span><span className="row-sub">{artists[a.artistId].name}</span></span>
                </button>
              </div>
            ))}
      </div>
    </Sheet>
  )
}

export const waveform = (id: ID, n = 56) => {
  let h = hash(id)
  return Array.from({ length: n }, (_, i) => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    const env = 0.45 + 0.55 * Math.sin((i / n) * Math.PI)
    return 0.18 + (h / 4294967296) * 0.82 * env
  })
}

/** Simulated 30s clip transport. With a live Spotify session it also drives the Web Playback SDK. */
export function useClip(track: Track, start: number) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!playing) return
    const t0 = Date.now()
    const iv = setInterval(() => {
      const p = (Date.now() - t0) / 30000
      if (p >= 1) { setPlaying(false); setProgress(0) } else setProgress(p)
    }, 100)
    return () => clearInterval(iv)
  }, [playing])
  useEffect(() => () => { if (spotifyLive()) stopClip() }, [])
  const toggle = () => {
    if (playing) { setPlaying(false); setProgress(0); if (spotifyLive()) stopClip() }
    else { setPlaying(true); if (spotifyLive()) playClip(track.title, artistOf(track).name, start).catch(() => window.open(spotifyLink(track), '_blank')) }
  }
  return { playing, progress, toggle }
}

export function OpenIn({ track }: { track: Track }) {
  return (
    <span className="openin">
      <a href={spotifyLink(track)} target="_blank" rel="noreferrer">Open in Spotify <Icon name="external" size={13} /></a>
    </span>
  )
}

/** Compact "best part" player shown on recommendations. */
export function ClipPlayer({ track, start }: { track: Track; start: number }) {
  const { playing, progress, toggle } = useClip(track, start)
  const bars = useMemo(() => waveform(track.id, 40), [track.id])
  const a = start / track.dur
  const b = Math.min(1, (start + 30) / track.dur)
  return (
    <div className="clip">
      <button className="playbtn" onClick={toggle} aria-label={playing ? 'Stop clip' : 'Play best part'}><Icon name={playing ? 'pause' : 'play'} size={18} /></button>
      <div className="clip-wave" aria-hidden="true">
        {bars.map((h, i) => {
          const x = i / bars.length
          const inWin = x >= a && x < b
          const done = inWin && playing && (x - a) / (b - a) <= progress
          return <i key={i} className={done ? 'done' : inWin ? 'in' : ''} style={{ height: `${h * 100}%` }} />
        })}
      </div>
      <span className="clip-time">{fmt(start)}–{fmt(Math.min(track.dur, start + 30))}</span>
    </div>
  )
}

/** Scrubber for choosing the 30-second best part. Emits a start time in seconds — no audio is stored. */
export function ClipPicker({ track, value, onChange }: { track: Track; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const { playing, progress, toggle } = useClip(track, value)
  const bars = useMemo(() => waveform(track.id, 64), [track.id])
  const max = Math.max(0, track.dur - 30)
  const a = value / track.dur
  const w = Math.min(1, 30 / track.dur)
  const move = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const center = ((clientX - r.left) / r.width) * track.dur
    onChange(Math.round(Math.max(0, Math.min(max, center - 15))))
  }
  return (
    <div className="clip-picker">
      <div
        className="wave" ref={ref}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons) move(e.clientX) }}
      >
        {bars.map((h, i) => {
          const x = i / bars.length
          const inWin = x >= a && x < a + w
          const done = inWin && playing && (x - a) / w <= progress
          return <i key={i} className={done ? 'done' : inWin ? 'in' : ''} style={{ height: `${h * 100}%` }} />
        })}
        <div className="wave-window" style={{ left: `${a * 100}%`, width: `${w * 100}%` }}><span>30s</span></div>
      </div>
      <input className="range" type="range" min={0} max={max} step={1} value={value} onChange={(e) => onChange(+e.target.value)} aria-label="Clip start time" />
      <div className="clip-meta">
        <button className="btn sm" onClick={toggle}><Icon name={playing ? 'pause' : 'play'} size={15} /> {playing ? 'Stop' : 'Preview'}</button>
        <span className="mono">{fmt(value)} – {fmt(Math.min(track.dur, value + 30))} <span className="muted">of {fmt(track.dur)}</span></span>
      </div>
    </div>
  )
}

/** Rate a song or album in place, without opening its page. Keeps any review already written there. */
export function QuickRate({ type, id }: { type: ItemType; id: ID }) {
  const mine = useStore((s) => s.ratings.find((r) => r.userId === 'me' && r.itemType === type && r.itemId === id))
  const rate = useStore((s) => s.rate)
  return (
    <span className="quickrate">
      <StarInput value={mine?.stars ?? 0} onChange={(v) => rate(type, id, v, mine?.review ?? '')} />
      <small>{mine ? `You: ${mine.stars.toFixed(1)}` : 'Tap to rate'}</small>
    </span>
  )
}

export function ReportButton({ kind, targetId }: { kind: 'comment' | 'review' | 'user' | 'rec'; targetId: ID }) {
  const report = useStore((s) => s.report)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  return (
    <>
      <button className="iconbtn subtle" aria-label="Report" title="Report" onClick={() => setOpen(true)}><Icon name="flag" size={15} /></button>
      <Sheet open={open} onClose={() => setOpen(false)} title={done ? 'Thanks for flagging' : 'Report'}>
        {done ? <p className="muted">A moderator will take a look. You can also block this person from their profile.</p> : (
          <div className="stack">
            {['Mean or harassing', 'Inappropriate language', 'Spam', 'Something else'].map((reason) => (
              <button key={reason} className="btn block" onClick={() => { report(kind, targetId, reason); setDone(true) }}>{reason}</button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  )
}

export function Comments({ targetId }: { targetId: ID }) {
  const s = useStore()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const list = s.comments.filter((c) => c.targetId === targetId && !c.hidden && !s.blocks.includes(c.userId))
  const submit = () => {
    const m = moderate(text)
    if (!m.text) return
    if (!m.ok) return setErr(m.error!)
    s.comment(targetId, m.text); setText(''); setErr('')
  }
  return (
    <div className="comments">
      {list.map((c) => (
        <div className="comment" key={c.id}>
          <Avatar user={s.users[c.userId]} size={26} />
          <p><UserLink user={s.users[c.userId]} /> {c.text} <span className="muted">· {timeAgo(c.at)}</span></p>
          {c.userId !== 'me' && <ReportButton kind="comment" targetId={c.id} />}
        </div>
      ))}
      <form className="comment-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <input placeholder="Add a comment" value={text} maxLength={240} onChange={(e) => setText(e.target.value)} aria-label="Add a comment" />
        <button className="btn primary sm" disabled={!text.trim()}>Post</button>
      </form>
      {err && <p className="error">{err}</p>}
    </div>
  )
}

export function RecCard({ rec, showTo }: { rec: Rec; showTo?: boolean }) {
  const users = useStore((s) => s.users)
  const t = tracks[rec.trackId]
  const from = users[rec.fromId]
  return (
    <article className="card rec">
      <header className="feed-head">
        <Avatar user={from} size={30} />
        <span><UserLink user={from} /> <span className="muted">{rec.toId ? (showTo && rec.toId !== 'me' ? `sent ${users[rec.toId]?.name.split(' ')[0]} a song` : 'sent you a song') : 'recommends'} · {timeAgo(rec.at)}</span></span>
        {rec.fromId !== 'me' && <ReportButton kind="rec" targetId={rec.id} />}
      </header>
      <TrackRow track={t} />
      {rec.note && <p className="note">“{rec.note}”</p>}
      <div className="kicker">The best part</div>
      <ClipPlayer track={t} start={rec.clipStart} />
      <div className="rec-foot"><QuickRate type="track" id={t.id} /><OpenIn track={t} /></div>
    </article>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>

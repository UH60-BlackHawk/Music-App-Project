import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store'
import type { ID, ItemType } from '../types'
import { albumOf, albumTracks, albums, artistOf, artists, fmt, tracks } from '../data/catalog'
import { avgRating, canSee, moderate, myRating, optedInListens, reviewsFor, timeAgo, trophiesForItem } from '../lib/select'
import { Trophy } from '../components/Brand'
import { Avatar, ClipPlayer, Cover, Empty, Icon, OpenIn, ReportButton, Section, StarInput, Stars, TopBar, TrackRow, UserLink } from '../components/ui'

function Trophies({ id }: { id: ID }) {
  const hall = useStore((s) => s.nma.hall)
  const users = useStore((s) => s.users)
  const won = trophiesForItem({ nma: { hall } } as any, id)
  if (!won.length) return null
  return (
    <div className="trophy-shelf">
      {won.map((h) => (
        <div className="trophy-card" key={h.id}>
          <Trophy size={40} />
          <span><b>{h.category}</b><small>{h.season} NMAs{h.nominatorId && users[h.nominatorId] ? ` · nominated by ${users[h.nominatorId].name}` : ''}</small></span>
        </div>
      ))}
    </div>
  )
}

function RatingBlock({ type, id }: { type: ItemType; id: ID }) {
  const s = useStore()
  const mine = myRating(s, type, id)
  const [stars, setStars] = useState(mine?.stars ?? 0)
  const [review, setReview] = useState(mine?.review ?? '')
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const r = avgRating(s, type, id)
  const reviews = reviewsFor(s, type, id)
  const save = () => {
    const m = moderate(review)
    if (!m.ok) return setErr(m.error!)
    s.rate(type, id, stars, m.text); setErr(''); setSaved(true)
  }
  return (
    <>
      <div className="card rating-summary">
        <div className="big-number">{r.count ? r.avg.toFixed(1) : '—'}</div>
        <div>
          <Stars value={r.avg} size={20} />
          <p className="muted">Nobles average · {r.count} rating{r.count === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div className="card stack">
        <div className="rate-row"><b>Your rating</b><StarInput value={stars} onChange={(v) => { setStars(v); setSaved(false) }} /><span className="mono">{stars ? stars.toFixed(1) : ''}</span></div>
        {stars > 0 && (
          <>
            <textarea className="input" rows={2} maxLength={240} placeholder="Add a short review (optional)" value={review} onChange={(e) => { setReview(e.target.value); setSaved(false) }} />
            {err && <p className="error">{err}</p>}
            <button className="btn primary" onClick={save} disabled={saved}>{saved ? 'Saved' : mine ? 'Update rating' : 'Post rating'}</button>
          </>
        )}
      </div>
      <Section title="Recent reviews">
        <div className="stack">
          {reviews.length ? reviews.slice(0, 12).map((rv) => (
            <div className="review" key={rv.id}>
              <Avatar user={s.users[rv.userId]} size={30} />
              <div>
                <p><UserLink user={s.users[rv.userId]} /> <Stars value={rv.stars} /> <span className="muted">· {timeAgo(rv.at)}</span></p>
                {rv.review && <p className="note">{rv.review}</p>}
              </div>
              {rv.userId !== 'me' && rv.review && <ReportButton kind="review" targetId={rv.id} />}
            </div>
          )) : <Empty>No ratings yet. Be the first.</Empty>}
        </div>
      </Section>
    </>
  )
}

export function TrackPage() {
  const { id = '' } = useParams()
  const s = useStore()
  const t = tracks[id]
  if (!t) return <><TopBar title="Song" /><Empty>That song isn’t in the catalog.</Empty></>
  const album = albumOf(t)
  const plays = optedInListens(s).filter((l) => l.trackId === id).length
  const clips = s.recs.filter((r) => r.trackId === id && !r.hidden && canSee(s, 'me', r.fromId) && (r.toId === null || r.toId === 'me' || r.fromId === 'me'))
  return (
    <>
      <TopBar title="Song" />
      <div className="detail-hero">
        <Cover id={id} size={168} />
        <h1>{t.title}</h1>
        <p className="detail-sub">{artistOf(t).name} · <Link to={`/album/${album.id}`}>{album.title}</Link> · {fmt(t.dur)}</p>
        <p className="fine">{plays} plays at Nobles</p>
        <div className="detail-actions">
          <Link className="btn primary" to={`/recommend/${id}`}><Icon name="send" size={16} /> Recommend</Link>
          <OpenIn track={t} />
        </div>
      </div>
      <Trophies id={id} />
      {clips.length > 0 && (
        <Section title="Best parts" kicker="Picked by classmates">
          <div className="stack">
            {clips.slice(0, 3).map((r) => (
              <div className="card" key={r.id}>
                <p className="muted"><UserLink user={s.users[r.fromId]} />{r.note ? ` — “${r.note}”` : ''}</p>
                <ClipPlayer track={t} start={r.clipStart} />
              </div>
            ))}
          </div>
        </Section>
      )}
      <RatingBlock key={id} type="track" id={id} />
    </>
  )
}

export function AlbumPage() {
  const { id = '' } = useParams()
  const a = albums[id]
  if (!a) return <><TopBar title="Album" /><Empty>That album isn’t in the catalog.</Empty></>
  return (
    <>
      <TopBar title="Album" />
      <div className="detail-hero">
        <Cover id={id} size={168} />
        <h1>{a.title}</h1>
        <p className="detail-sub">{artists[a.artistId].name} · {a.year}</p>
      </div>
      <Trophies id={id} />
      <Section title="Songs">
        <div className="list">{albumTracks(id).map((t, i) => <TrackRow key={t.id} track={t} rank={i + 1} sub={fmt(t.dur)} />)}</div>
      </Section>
      <RatingBlock key={id} type="album" id={id} />
    </>
  )
}

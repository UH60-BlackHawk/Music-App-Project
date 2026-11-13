import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { albums, artists, tracks } from '../data/catalog'
import { avgRating, dailyPick, feed, inbox, timeAgo, type FeedItem } from '../lib/select'
import { forYou } from '../lib/recs'
import { ThemeDecor, Wordmark } from '../components/Brand'
import { Avatar, Comments, Cover, Empty, Icon, QuickRate, RecCard, Section, Seg, Stars, TrackRow, UserLink } from '../components/ui'

function Daily() {
  const s = useStore()
  const [tab, setTab] = useState<'track' | 'album'>('track')
  const [open, setOpen] = useState(false)
  const pick = useMemo(() => dailyPick(s), [s.daily, s.listens, s.ratings, s.recs])
  const id = tab === 'track' ? pick.trackId : pick.albumId
  const title = tab === 'track' ? tracks[id].title : albums[id].title
  const artist = artists[tab === 'track' ? tracks[id].artistId : albums[id].artistId].name
  const r = avgRating(s, tab, id)
  const target = `daily-${id}`
  const nComments = s.comments.filter((c) => c.targetId === target && !c.hidden).length
  return (
    <section className="daily card hero">
      <div className="daily-top">
        <span className="kicker">{tab === 'track' ? 'Song of the Day' : 'Album of the Day'}</span>
        <Seg options={[['track', 'Song'], ['album', 'Album']]} value={tab} onChange={setTab} />
      </div>
      <Link to={`/${tab}/${id}`} className="daily-main">
        <Cover id={id} size={104} />
        <div>
          <h2 className="daily-title">{title}</h2>
          <p className="daily-artist">{artist}</p>
          {r.count > 0 && <p className="daily-rating"><Stars value={r.avg} /> <span>{r.avg.toFixed(1)} · {r.count} Nobles rating{r.count === 1 ? '' : 's'}</span></p>}
          <p className="fine">{pick.why}</p>
        </div>
      </Link>
      <div className="daily-actions">
        <QuickRate type={tab} id={id} />
        <button className="chip" onClick={() => setOpen(!open)} aria-label={`${nComments} comments`}><Icon name="comment" size={15} /> <b>{nComments}</b></button>
      </div>
      {open && <Comments targetId={target} />}
    </section>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === 'rec') return <RecCard rec={item.rec} showTo />
  const head = (text: string) => (
    <header className="feed-head">
      <Avatar user={item.user} size={30} />
      <span><UserLink user={item.user} /> <span className="muted">{text} · {timeAgo(item.at)}</span></span>
    </header>
  )
  if (item.kind === 'listen')
    return (
      <article className="card feed">
        {head('is listening to')}
        <TrackRow track={item.track} right={item.more > 0 ? <Link className="pill" to={`/profile/${item.user.id}`}>+{item.more} more</Link> : undefined} />
      </article>
    )
  const r = item.rating
  const isTrack = r.itemType === 'track'
  return (
    <article className="card feed">
      {head(`rated ${isTrack ? 'a song' : 'an album'}`)}
      <div className="row">
        <Link className="row-main" to={`/${r.itemType}/${r.itemId}`}>
          <Cover id={r.itemId} size={46} />
          <span className="row-text">
            <span className="row-title">{isTrack ? tracks[r.itemId].title : albums[r.itemId].title}</span>
            <span className="row-sub">{artists[isTrack ? tracks[r.itemId].artistId : albums[r.itemId].artistId].name}</span>
          </span>
        </Link>
        <span className="row-right"><Stars value={r.stars} size={15} /></span>
      </div>
      {r.review && <p className="note">“{r.review}”</p>}
    </article>
  )
}

export default function Home() {
  const s = useStore()
  const items = useMemo(() => feed(s), [s.listens, s.ratings, s.recs, s.follows, s.blocks, s.users])
  const mine = useMemo(() => inbox(s), [s.recs, s.blocks])
  const fy = useMemo(() => forYou(s, 8), [s.listens, s.ratings, s.recs, s.follows, s.blocks, s.users])
  const me = s.users.me
  return (
    <>
      <header className="homebar">
        <Wordmark />
        <ThemeDecor />
        <div className="topbar-right">
          <Link className="iconbtn" to="/settings" aria-label="Settings"><Icon name="settings" /></Link>
        </div>
      </header>

      {me.sharingPaused && <Link to="/settings" className="banner">Sharing is paused — friends can’t see your listening. <b>Resume</b></Link>}
      {!me.spotify && <Link to="/settings" className="banner">Connect Spotify to share what you’re playing. <b>Connect</b></Link>}

      <Daily />

      {mine.length > 0 && (
        <Section title="Sent to you" kicker={`${mine.length} from friends`}>
          <div className="carousel wide">{mine.map((r) => <RecCard key={r.id} rec={r} />)}</div>
        </Section>
      )}

      <Section title="For You" action={<Link className="more" to="/discover">See all</Link>}>
        <div className="carousel">
          {fy.map(({ track, reason }) => (
            <Link key={track.id} to={`/track/${track.id}`} className="tile">
              <Cover id={track.id} size={132} />
              <b>{track.title}</b>
              <span>{artists[track.artistId].name}</span>
              <em className="reason">{reason}</em>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Friends’ activity" action={<Link className="btn primary sm" to="/recommend"><Icon name="send" size={15} /> Recommend</Link>}>
        <div className="stack">
          {items.length ? items.map((i) => <FeedRow key={i.id} item={i} />) : <Empty>Follow some classmates in Discover to fill your feed.</Empty>}
        </div>
      </Section>
    </>
  )
}

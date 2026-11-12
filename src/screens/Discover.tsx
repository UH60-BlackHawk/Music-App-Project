import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { albumList, artistOf, artists, trackList } from '../data/catalog'
import { forYou, friendsInto } from '../lib/recs'
import { isFollowing } from '../lib/select'
import { Avatar, Cover, Empty, Icon, Section, TrackRow } from '../components/ui'

export function FollowButton({ id }: { id: string }) {
  const s = useStore()
  if (id === 'me' || s.blocks.includes(id)) return null
  const on = isFollowing(s, 'me', id)
  return <button className={`btn sm ${on ? '' : 'primary'}`} onClick={() => s.toggleFollow(id)}>{on ? 'Following' : isFollowing(s, id, 'me') ? 'Follow back' : 'Follow'}</button>
}

export default function Discover() {
  const s = useStore()
  const [q, setQ] = useState('')
  const deps = [s.listens, s.ratings, s.recs, s.follows, s.blocks, s.users]
  const fy = useMemo(() => forYou(s, 10), deps)
  const into = useMemo(() => friendsInto(s), deps)
  const ql = q.trim().toLowerCase()
  const people = Object.values(s.users).filter((u) => u.id !== 'me' && !s.blocks.includes(u.id))

  return (
    <>
      <header className="pagehead"><h1>Discover</h1></header>
      <label className="search"><Icon name="search" size={18} /><input placeholder="Songs, albums, classmates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>

      {ql ? (
        <div className="stack">
          <div className="list">
            {trackList.filter((t) => `${t.title} ${artistOf(t).name}`.toLowerCase().includes(ql)).slice(0, 8).map((t) => (
              <TrackRow key={t.id} track={t} right={<Link className="iconbtn" to={`/recommend/${t.id}`} aria-label="Recommend"><Icon name="send" size={18} /></Link>} />
            ))}
            {albumList.filter((a) => `${a.title} ${artists[a.artistId].name}`.toLowerCase().includes(ql)).slice(0, 5).map((a) => (
              <div className="row" key={a.id}>
                <Link className="row-main" to={`/album/${a.id}`}>
                  <Cover id={a.id} size={46} />
                  <span className="row-text"><span className="row-title">{a.title}</span><span className="row-sub">Album · {artists[a.artistId].name}</span></span>
                </Link>
              </div>
            ))}
            {people.filter((u) => `${u.name} ${u.handle}`.toLowerCase().includes(ql)).map((u) => (
              <div className="row" key={u.id}>
                <Link className="row-main" to={`/profile/${u.id}`}>
                  <Avatar user={u} size={46} />
                  <span className="row-text"><span className="row-title">{u.name}</span><span className="row-sub">@{u.handle} · ’{String(u.classYear).slice(2)}</span></span>
                </Link>
                <span className="row-right"><FollowButton id={u.id} /></span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <Section title="For You" kicker="From your listening + your friends">
            <div className="list">
              {fy.length ? fy.map(({ track, reason }) => (
                <TrackRow key={track.id} track={track} sub={<>{artistOf(track).name} · <em className="reason">{reason}</em></>} />
              )) : <Empty>Connect a music account and follow friends to get picks.</Empty>}
            </div>
          </Section>

          <Section title="Your Friends Are Into" kicker="This week">
            <div className="chips">
              {into.artists.map(({ artist, friends }) => <span className="chip static" key={artist.id}>{artist.name}<b>{friends}</b></span>)}
            </div>
            <div className="carousel">
              {into.songs.map(({ track, reason }) => (
                <Link key={track.id} to={`/track/${track.id}`} className="tile">
                  <Cover id={track.id} size={132} />
                  <b>{track.title}</b>
                  <span>{artistOf(track).name}</span>
                  <em className="reason">{reason}</em>
                </Link>
              ))}
            </div>
          </Section>

          <Link to="/party" className="card promo">
            <Icon name="headphones" size={28} />
            <span><b>Listening Party</b><small>Share a queue. Vote on what plays next.</small></span>
          </Link>

          <Section title="Classmates">
            <div className="list">
              {people.map((u) => (
                <div className="row" key={u.id}>
                  <Link className="row-main" to={`/profile/${u.id}`}>
                    <Avatar user={u} size={46} />
                    <span className="row-text"><span className="row-title">{u.name}</span><span className="row-sub">’{String(u.classYear).slice(2)}{u.bio ? ` · ${u.bio}` : ''}</span></span>
                  </Link>
                  <span className="row-right"><FollowButton id={u.id} /></span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </>
  )
}

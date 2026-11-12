import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { albums, artists, tracks } from '../data/catalog'
import { canSee, followers, following, timeAgo, topArtists, trophiesForUser, userListens } from '../lib/select'
import { Trophy } from '../components/Brand'
import { Avatar, Cover, Empty, Icon, ReportButton, Section, Sheet, Stars, TopBar, TrackRow } from '../components/ui'
import { FollowButton } from './Discover'

const BADGE_ICON: Record<string, string> = { 'Called It': '🔮', Voter: '🗳️', Nominator: '✍️' }

export default function Profile() {
  const { id = 'me' } = useParams()
  const s = useStore()
  const [menu, setMenu] = useState(false)
  const u = s.users[id]
  if (!u) return <><TopBar title="Profile" /><Empty>No student found.</Empty></>
  const isMe = id === 'me'
  const blocked = s.blocks.includes(id)
  const visible = canSee(s, 'me', id)
  const listens = visible ? userListens(s, id) : []
  const top = visible ? topArtists(s, id, 6) : []
  const ratings = visible ? s.ratings.filter((r) => r.userId === id && !r.hidden).sort((a, b) => b.at - a.at).slice(0, 6) : []
  const trophies = trophiesForUser(s, id)
  const recent = [...new Map(listens.map((l) => [l.trackId, l])).values()].slice(0, 6)

  return (
    <>
      <TopBar
        title={isMe ? 'Your profile' : u.name.split(' ')[0]}
        right={isMe
          ? <Link className="iconbtn" to="/settings" aria-label="Settings"><Icon name="settings" /></Link>
          : <button className="iconbtn" aria-label="More" onClick={() => setMenu(true)}><Icon name="more" /></button>}
      />
      <div className="profile-head">
        <Avatar user={u} size={84} />
        <h1>{u.name}</h1>
        <p className="muted">@{u.handle} · Class of {u.classYear}</p>
        {u.bio && <p className="bio">{u.bio}</p>}
        <div className="stats">
          <span><b>{followers(s, id).length}</b> followers</span>
          <span><b>{following(s, id).length}</b> following</span>
          <span><b>{trophies.length}</b> {trophies.length === 1 ? 'trophy' : 'trophies'}</span>
        </div>
        {!isMe && !blocked && <div className="detail-actions"><FollowButton id={id} /></div>}
        {blocked && <button className="btn" onClick={() => s.unblock(id)}>Unblock</button>}
      </div>

      {visible && u.nowPlaying && (
        <Link to={`/track/${u.nowPlaying}`} className="card nowplaying">
          <span className="eq" aria-hidden="true"><i /><i /><i /></span>
          <span><small>Listening now</small><b>{tracks[u.nowPlaying].title}</b> · {artists[tracks[u.nowPlaying].artistId].name}</span>
        </Link>
      )}

      {(trophies.length > 0 || u.badges.length > 0) && (
        <Section title="Trophy case">
          <div className="trophy-shelf">
            {trophies.map((h) => (
              <Link to={`/${h.itemType}/${h.itemId}`} className="trophy-card" key={h.id}>
                <Trophy size={40} />
                <span><b>{h.category}</b><small>{h.season} · {h.itemType === 'track' ? tracks[h.itemId].title : albums[h.itemId].title}</small></span>
              </Link>
            ))}
          </div>
          <div className="chips">{u.badges.map((b) => <span className="chip static badge" key={b}>{BADGE_ICON[b] ?? '🏅'} {b}</span>)}</div>
        </Section>
      )}

      {!visible ? (
        <div className="card locked">
          <Icon name="lock" size={26} />
          <p>{blocked ? 'You blocked this student.' : u.sharingPaused ? `${u.name.split(' ')[0]} has paused sharing.` : u.privacy === 'private' ? 'This profile’s listening is private.' : 'Listening is visible to friends only. Follow each other to see it.'}</p>
        </div>
      ) : (
        <>
          <Section title="Top artists">
            {top.length ? (
              <div className="carousel">
                {top.map(([aid, n]) => (
                  <div className="tile small" key={aid}><Cover id={aid} size={84} className="round" /><b>{artists[aid].name}</b><span>{n} plays</span></div>
                ))}
              </div>
            ) : <Empty>{isMe ? 'Connect Spotify or Apple Music in Settings to see your top artists.' : 'Nothing yet.'}</Empty>}
          </Section>

          <Section title="Favorite albums">
            <div className="carousel">
              {u.favoriteAlbums.map((aid) => (
                <Link className="tile small" to={`/album/${aid}`} key={aid}><Cover id={aid} size={104} /><b>{albums[aid].title}</b><span>{artists[albums[aid].artistId].name}</span></Link>
              ))}
            </div>
          </Section>

          <Section title="Recent listens">
            <div className="list">
              {recent.length ? recent.map((l) => <TrackRow key={l.id} track={tracks[l.trackId]} right={<span className="muted">{timeAgo(l.at)}</span>} />) : <Empty>No recent listens.</Empty>}
            </div>
          </Section>

          <Section title="Ratings">
            <div className="list">
              {ratings.length ? ratings.map((r) => (
                <div className="row" key={r.id}>
                  <Link className="row-main" to={`/${r.itemType}/${r.itemId}`}>
                    <Cover id={r.itemId} size={46} />
                    <span className="row-text">
                      <span className="row-title">{r.itemType === 'track' ? tracks[r.itemId].title : albums[r.itemId].title}</span>
                      <span className="row-sub">{r.review || (r.itemType === 'album' ? 'Album' : artists[tracks[r.itemId].artistId].name)}</span>
                    </span>
                  </Link>
                  <span className="row-right"><Stars value={r.stars} /></span>
                </div>
              )) : <Empty>No ratings yet.</Empty>}
            </div>
          </Section>
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={u.name}>
        <div className="stack">
          <button className="btn block danger" onClick={() => { blocked ? s.unblock(id) : s.block(id); setMenu(false) }}>{blocked ? 'Unblock' : 'Block'} {u.name.split(' ')[0]}</button>
          <p className="fine">Blocking hides their activity, comments and recommendations from you and removes follows in both directions.</p>
          <div className="report-row"><span>Report this profile</span><ReportButton kind="user" targetId={id} /></div>
        </div>
      </Sheet>
    </>
  )
}

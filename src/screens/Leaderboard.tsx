import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { albums, artists, genreLabel, tracks, type GenreFilter } from '../data/catalog'
import { leaderboard, trending, type Range } from '../lib/select'
import { LIVE } from '../services/mode'
import { useRpc } from '../services/useRemote'
import { Cover, Empty, GenreFilterBar, Icon, Seg, TrackRow } from '../components/ui'

type Kind = 'songs' | 'artists' | 'albums' | 'trending'

export default function Leaderboard() {
  const s = useStore()
  const [kind, setKind] = useState<Kind>('songs')
  const [range, setRange] = useState<Range>('week')
  const [genre, setGenre] = useState<GenreFilter>('all')
  // Live mode: totals come from the server, which counts every opted-in student (you can't see their individual plays).
  const genres = genre === 'all' ? null : genre === 'mine' ? (s.users.me.genres ?? []) : [genre]
  const since = new Date(range === 'all' ? 0 : Date.now() - (range === 'week' ? 7 : 30) * 864e5).toISOString().slice(0, 10)
  const liveRows = useRpc<{ id: string; plays: number }[]>('leaderboard', LIVE && kind !== 'trending' ? { p_kind: kind, p_since: since, p_genres: genres } : null, [kind, since, genre, s.listens.length])
  const liveTrend = useRpc<{ id: string; plays: number; delta: number }[]>('trending', LIVE && kind === 'trending' ? { p_genres: genres } : null, [kind, genre, s.listens.length])
  const known = (k: Kind, id: string) => (k === 'artists' ? artists[id] : k === 'albums' ? albums[id] : tracks[id])
  const rows = useMemo(() => (kind === 'trending' ? [] : LIVE ? (liveRows ?? []).filter((r) => known(kind, r.id)).map((r) => ({ id: r.id, plays: Number(r.plays) })) : leaderboard(s, kind, range, genre)), [s.listens, s.users, kind, range, genre, liveRows])
  const trend = useMemo(() => (LIVE ? (liveTrend ?? []).filter((r) => tracks[r.id]).map((r) => ({ ...r, plays: Number(r.plays), delta: Number(r.delta) })) : trending(s, genre)), [s.listens, s.users, genre, liveTrend])
  const empty = kind === 'trending' ? !trend.length : !rows.length
  const optedIn = Object.values(s.users).filter((u) => u.leaderboardOptIn).length
  const max = rows[0]?.plays ?? 1

  return (
    <>
      <header className="pagehead">
        <div className="kicker">Nobles Leaderboard</div>
        <h1>Charts</h1>
      </header>
      <Seg options={[['songs', 'Songs'], ['artists', 'Artists'], ['albums', 'Albums'], ['trending', 'Trending']]} value={kind} onChange={setKind} />
      {kind !== 'trending' && (
        <div className="filters">
          {([['week', 'This week'], ['month', 'This month'], ['all', 'All time']] as [Range, string][]).map(([v, l]) => (
            <button key={v} className={`chip ${range === v ? 'on' : ''}`} onClick={() => setRange(v)}>{l}</button>
          ))}
        </div>
      )}
      <GenreFilterBar value={genre} onChange={setGenre} />

      {empty && <Empty>{kind === 'trending' ? 'Nothing is climbing' : 'No plays'} in {genre === 'all' ? 'any genre' : genre === 'mine' ? 'your genres' : genreLabel(genre)} {kind === 'trending' ? 'this week' : range === 'all' ? 'yet' : `this ${range}`}.</Empty>}
      <div className="list chart">
        {kind === 'trending'
          ? trend.map((r, i) => (
              <TrackRow key={r.id} track={tracks[r.id]} rank={i + 1} right={<span className="delta"><Icon name="up" size={14} /> {r.delta}<small>plays</small></span>} />
            ))
          : rows.map((r, i) => {
              const bar = <span className="bar" style={{ width: `${(r.plays / max) * 100}%` }} />
              const right = <span className="plays">{r.plays}<small>plays</small></span>
              if (kind === 'songs') return <div className="chart-row" key={r.id}>{bar}<TrackRow track={tracks[r.id]} rank={i + 1} right={right} /></div>
              const title = kind === 'artists' ? artists[r.id].name : albums[r.id].title
              const sub = kind === 'artists' ? artists[r.id].genre : artists[albums[r.id].artistId].name
              const inner = (
                <>
                  <span className="rank">{i + 1}</span>
                  <Cover id={r.id} size={46} className={kind === 'artists' ? 'round' : ''} />
                  <span className="row-text"><span className="row-title">{title}</span><span className="row-sub">{sub}</span></span>
                </>
              )
              return (
                <div className="chart-row" key={r.id}>
                  {bar}
                  <div className="row">
                    {kind === 'albums' ? <Link className="row-main" to={`/album/${r.id}`}>{inner}</Link> : <span className="row-main">{inner}</span>}
                    <span className="row-right">{right}</span>
                  </div>
                </div>
              )
            })}
      </div>
      <p className="fine center">
        <Icon name="shield" size={13} /> Totals only, from {optedIn} students who opted in. Charts never show who listened to what.
      </p>
    </>
  )
}

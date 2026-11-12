import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { albums, artists, tracks } from '../data/catalog'
import { leaderboard, trending, type Range } from '../lib/select'
import { Cover, Icon, Seg, TrackRow } from '../components/ui'

type Kind = 'songs' | 'artists' | 'albums' | 'trending'

export default function Leaderboard() {
  const s = useStore()
  const [kind, setKind] = useState<Kind>('songs')
  const [range, setRange] = useState<Range>('week')
  const rows = useMemo(() => (kind === 'trending' ? [] : leaderboard(s, kind, range)), [s.listens, s.users, kind, range])
  const trend = useMemo(() => trending(s), [s.listens, s.users])
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

import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './store'
import { Icon } from './components/ui'
import Welcome from './screens/Welcome'
import Home from './screens/Home'
import Discover from './screens/Discover'
import Leaderboard from './screens/Leaderboard'
import Awards, { Ceremony } from './screens/Awards'
import Predictions from './screens/Predictions'
import Profile from './screens/Profile'
import { AlbumPage, TrackPage } from './screens/Detail'
import Recommend from './screens/Recommend'
import Settings from './screens/Settings'
import Admin from './screens/Admin'

const TABS = [
  ['/', 'home', 'Home'],
  ['/discover', 'compass', 'Discover'],
  ['/charts', 'chart', 'Charts'],
  ['/awards', 'trophy', 'NMAs'],
  ['/profile/me', 'user', 'Profile'],
] as const

// `?embed=1` drops the outer frame so Aux can be hosted inside another app's web view later.
const embed = new URLSearchParams(location.search).has('embed')

function Shell() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const immersive = pathname.startsWith('/ceremony')
  return (
    <div className={`app ${embed ? 'embed' : ''}`}>
      <main className="screen" key={pathname}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/charts" element={<Leaderboard />} />
          <Route path="/awards" element={<Awards />} />
          <Route path="/ceremony" element={<Ceremony />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/track/:id" element={<TrackPage />} />
          <Route path="/album/:id" element={<AlbumPage />} />
          <Route path="/recommend/:id?" element={<Recommend />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      {!immersive && (
        <nav className="nav" aria-label="Main">
          {TABS.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
              <Icon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}

export default function App() {
  const theme = useStore((s) => s.theme)
  const ready = useStore((s) => s.signedIn && s.onboarded)
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  return <HashRouter>{ready ? <Shell /> : <div className={`app ${embed ? 'embed' : ''}`}><Welcome /></div>}</HashRouter>
}

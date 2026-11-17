import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { THEME_CATEGORIES, THEMES, Trophy, Wordmark } from '../components/Brand'
import { Avatar, GenrePicker, Icon, Section, Toggle, TopBar } from '../components/ui'
import { beginSpotifyAuth, spotifyConfigured, spotifyLive, spotifyLogout } from '../services/spotify'
import { syncSpotify } from '../services/spotifySync'
import { LIVE } from '../services/mode'
import { timeAgo } from '../lib/select'
import { PRIVACY_OPTIONS } from './Welcome'
import { ProfilePhoto } from '../components/Photo'

export default function Settings() {
  const s = useStore()
  const me = s.users.me
  const [syncing, setSyncing] = useState(false)
  const [syncErr, setSyncErr] = useState('')
  const syncNow = () => { setSyncing(true); setSyncErr(''); syncSpotify(true).catch(() => setSyncErr('Couldn’t reach Spotify. Try again, or disconnect and reconnect.')).finally(() => setSyncing(false)) }

  const toggleSpotify = () => {
    if (me.spotify) { s.disconnect(); spotifyLogout() }
    else if (spotifyConfigured) void beginSpotifyAuth()
    else s.connect()
  }

  return (
    <>
      <TopBar title="Settings" />

      <Section title="Profile">
        <div className="card profile-settings">
          <ProfilePhoto size={64} />
          <span className="row-text">
            <span className="row-title">{me.name}</span>
            <span className="row-sub">{me.photo ? 'Tap your photo to change or remove it' : 'Tap to add a profile photo'}</span>
          </span>
        </div>
      </Section>

      <Section title="Your genres" kicker="Shapes For You and the “My genres” filter">
        <div className="card">
          <GenrePicker value={me.genres ?? []} onChange={(genres) => s.updateMe({ genres })} />
          <p className="fine">{me.genres?.length ? 'Shown on your profile. Tap again to remove.' : 'Pick as many as you like.'}</p>
        </div>
      </Section>

      <Section title="Theme" kicker="Reskins everything, instantly">
        {THEME_CATEGORIES.map((cat) => (
          <div key={cat}>
            <h3 className="theme-cat">{cat}</h3>
            <div className="theme-grid">
              {THEMES.filter((t) => t.category === cat).map((t) => (
                <button key={t.id} data-theme={t.id} className={`theme-swatch ${s.theme === t.id ? 'on' : ''}`} onClick={() => s.setTheme(t.id)} aria-pressed={s.theme === t.id}>
                  <span className="swatch-top"><Wordmark size={26} /><Trophy size={30} theme={t.id} /></span>
                  <span className="swatch-chips"><i className="a" /><i className="b" /><i className="c" /></span>
                  <b>{t.name}</b>
                  <small>{t.blurb}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Privacy">
        <div className="card stack">
          {PRIVACY_OPTIONS.map(([v, label, hint]) => (
            <label key={v} className={`radio-row ${me.privacy === v ? 'on' : ''}`}>
              <input type="radio" name="privacy" checked={me.privacy === v} onChange={() => s.updateMe({ privacy: v })} />
              <span><b>{label}</b><small>{hint}</small></span>
            </label>
          ))}
          <Toggle label="Pause activity sharing" hint="Hides your listening from everyone until you turn it back on" checked={me.sharingPaused} onChange={(v) => s.updateMe({ sharingPaused: v })} />
          <Toggle label="Count me in the Nobles Leaderboard" hint="Adds your plays to school-wide totals. Never shows your name." checked={me.leaderboardOptIn} onChange={(v) => s.updateMe({ leaderboardOptIn: v })} />
        </div>
      </Section>

      <Section title="Connected account">
        <div className="card stack">
          <div className="toggle-row">
            <span><b>Spotify</b><small>{!me.spotify ? 'Not connected' : me.spotifySync ? `Synced ${timeAgo(me.spotifySync.at) === 'now' ? 'just now' : `${timeAgo(me.spotifySync.at)} ago`} · ${me.spotifySync.plays} real plays imported` : 'Connected · sample listening data'}</small></span>
            <button className={`btn sm ${me.spotify ? '' : 'primary'}`} onClick={toggleSpotify}>{me.spotify ? 'Disconnect' : 'Connect'}</button>
          </div>
          {me.spotify && spotifyLive() && <button className="btn block" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>}
          {syncErr && <p className="error">{syncErr}</p>}
          {!spotifyConfigured && <p className="fine">Prototype mode: connections use sample listening data.</p>}
        </div>
      </Section>

      {s.blocks.length > 0 && (
        <Section title="Blocked">
          <div className="list">
            {s.blocks.map((id) => (
              <div className="row" key={id}>
                <span className="row-main"><Avatar user={s.users[id]} size={36} /><span className="row-text"><span className="row-title">{s.users[id].name}</span></span></span>
                <span className="row-right"><button className="btn sm" onClick={() => s.unblock(id)}>Unblock</button></span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {(!LIVE || s.admin) && <Section title="Admin">
        <div className="card stack">
          {!LIVE && <Toggle label="Admin mode" hint="Prototype switch — real admins would be assigned by the school" checked={s.admin} onChange={s.setAdmin} />}
          {s.admin && <Link className="btn block" to="/admin"><Icon name="shield" size={16} /> Open admin dashboard</Link>}
        </div>
      </Section>}

      <Section title="Account">
        <div className="card stack">
          <p className="muted">Signed in as <b>{me.email}</b></p>
          {!LIVE && <button className="btn block" onClick={() => { if (confirm('Reset all demo data and sign out?')) s.resetDemo() }}>Reset demo data</button>}
          <button className="btn block danger" onClick={s.signOut}>Sign out</button>
        </div>
      </Section>
    </>
  )
}

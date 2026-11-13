import { useState } from 'react'
import { useStore } from '../store'
import type { Privacy } from '../types'
import { Trophy, Wordmark } from '../components/Brand'
import { Icon } from '../components/ui'
import { beginSpotifyAuth, spotifyConfigured } from '../services/spotify'

export const SCHOOL_DOMAIN = 'nobles.edu'
export const PRIVACY_OPTIONS: [Privacy, string, string][] = [
  ['school', 'Whole school', 'Any signed-in Nobles student can see your listening'],
  ['friends', 'Friends only', 'Only people you follow who follow you back'],
  ['private', 'Private', 'Nobody sees your activity'],
]

export default function Welcome() {
  const s = useStore()
  const [step, setStep] = useState(s.signedIn ? 3 : 0)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [year, setYear] = useState(2027)
  const [err, setErr] = useState('')
  const [imported, setImported] = useState<number | null>(null)
  const me = s.users.me

  const submitEmail = () => {
    if (!new RegExp(`^[a-z0-9._-]+@${SCHOOL_DOMAIN.replace('.', '\\.')}$`, 'i').test(email.trim()))
      return setErr(`Aux is just for Nobles students — sign in with your @${SCHOOL_DOMAIN} email.`)
    setErr(''); setStep(1)
  }
  const submitCode = () => {
    if (!/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code.')
    setErr(''); setStep(2)
  }
  const connect = () => {
    if (spotifyConfigured) return void beginSpotifyAuth()
    setImported(s.connect())
  }

  return (
    <main className="welcome">
      <div className="welcome-brand">
        <Wordmark size={64} />
        <p className="tagline">Pass the aux, Nobles.</p>
      </div>

      {step === 0 && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); submitEmail() }}>
          <h2>Sign in with your school email</h2>
          <input className="input" type="email" inputMode="email" placeholder={`you@${SCHOOL_DOMAIN}`} value={email} onChange={(e) => setEmail(e.target.value)} aria-label="School email" autoFocus />
          {err && <p className="error">{err}</p>}
          <button className="btn primary block">Send me a code</button>
          <button type="button" className="btn ghost block" onClick={() => { setEmail(`jellis27@${SCHOOL_DOMAIN}`); setName('Jordan Ellis'); setErr('') }}>Use the demo student</button>
          <p className="fine">One account per school email. We never post without you choosing to share.</p>
        </form>
      )}

      {step === 1 && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); submitCode() }}>
          <h2>Check your inbox</h2>
          <p className="muted">We sent a 6-digit code to <b>{email}</b>.</p>
          <input className="input code" inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Verification code" autoFocus />
          {err && <p className="error">{err}</p>}
          <button className="btn primary block">Verify</button>
          <p className="fine">Prototype: no email is actually sent — any 6 digits work.</p>
        </form>
      )}

      {step === 2 && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { s.signIn(email.trim(), name.trim(), year); setStep(3) } }}>
          <h2>Who’s got the aux?</h2>
          <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" autoFocus />
          <div className="seg">
            {[2027, 2028, 2029, 2030].map((y) => <button type="button" key={y} className={y === year ? 'on' : ''} onClick={() => setYear(y)}>’{String(y).slice(2)}</button>)}
          </div>
          <button className="btn primary block" disabled={!name.trim()}>Continue</button>
        </form>
      )}

      {step === 3 && (
        <div className="card stack">
          <h2>Connect Spotify</h2>
          <p className="muted">Aux reads your recently played, top artists and what’s playing now. You control who sees it.</p>
          <button className={`btn block provider ${me.spotify ? 'done' : ''}`} onClick={connect} disabled={me.spotify}>
            <Icon name={me.spotify ? 'check' : 'headphones'} size={18} /> {me.spotify ? 'Spotify connected' : 'Connect Spotify'}
          </button>
          {imported !== null && imported > 0 && <p className="ok">Imported {imported} recent plays.</p>}
          {!spotifyConfigured && <p className="fine">Prototype: connecting uses sample listening data until a Spotify client ID is configured.</p>}
          <button className="btn primary block" onClick={() => setStep(4)}>{me.spotify ? 'Continue' : 'Skip for now'}</button>
        </div>
      )}

      {step === 4 && (
        <div className="card stack">
          <h2>Who can see your listening?</h2>
          {PRIVACY_OPTIONS.map(([v, label, hint]) => (
            <label key={v} className={`radio-row ${me.privacy === v ? 'on' : ''}`}>
              <input type="radio" name="privacy" checked={me.privacy === v} onChange={() => s.updateMe({ privacy: v })} />
              <span><b>{label}</b><small>{hint}</small></span>
            </label>
          ))}
          <p className="fine">Change this or pause sharing anytime in Settings.</p>
          <button className="btn primary block" onClick={s.finishOnboarding}>Start listening</button>
        </div>
      )}

      <div className="welcome-foot"><Trophy size={44} /><span className="fine">Home of the Noble Music Awards</span></div>
    </main>
  )
}

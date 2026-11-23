import { useEffect, useState } from 'react'
import { useStore } from '../store'
import type { Privacy } from '../types'
import { Trophy, Wordmark } from '../components/Brand'
import { GenrePicker, Icon } from '../components/ui'
import { beginSpotifyAuth, spotifyConfigured } from '../services/spotify'
import { LIVE } from '../services/mode'
import { remote } from '../services/remote'
import { onSignedIn } from '../services/live'
import { LastfmConnect } from '../components/Lastfm'
import { useSpotifyStatus } from '../services/spotifySync'
import { lastfmConfigured } from '../services/lastfm'

export const SCHOOL_DOMAIN = 'nobles.edu'
export const PRIVACY_OPTIONS: [Privacy, string, string][] = [
  ['school', 'Whole school', 'Any signed-in Nobles student can see your listening'],
  ['friends', 'Friends only', 'Only people you follow who follow you back'],
  ['private', 'Private', 'Nobody sees your activity'],
]

const friendly = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  if (/rate limit|too many/i.test(m)) return 'Too many sign-in emails just now. Wait a few minutes and try again.'
  if (/expired|invalid/i.test(m)) return 'That code didn’t work. Check it, or request a new email.'
  if (/only for/i.test(m) || /saving new user/i.test(m)) return `Aux is just for Nobles students — use your @${SCHOOL_DOMAIN} email.`
  return m
}

export default function Welcome() {
  const s = useStore()
  const [step, setStep] = useState(s.signedIn ? (LIVE && !s.users.me.name ? 2 : 3) : 0)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [year, setYear] = useState(2027)
  const [err, setErr] = useState('')
  const [imported, setImported] = useState<number | null>(null)
  const me = s.users.me
  const spotifyError = useSpotifyStatus((x) => x.error)

  const submitEmail = async () => {
    if (!new RegExp(`^[a-z0-9._-]+@${SCHOOL_DOMAIN.replace('.', '\\.')}$`, 'i').test(email.trim()))
      return setErr(`Aux is just for Nobles students — sign in with your @${SCHOOL_DOMAIN} email.`)
    setErr('')
    if (LIVE && remote) {
      setBusy(true)
      try { await remote.sendCode(email.trim().toLowerCase(), location.origin + location.pathname); setSent(true) } catch (e) { return setErr(friendly(e)) } finally { setBusy(false) }
    }
    setStep(1)
  }
  const submitCode = async () => {
    if (!LIVE) {
      if (!/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code.')
      setErr(''); return setStep(2)
    }
    if (!/^\d{6,8}$/.test(code)) return setErr('Enter the code from the email (6 to 8 digits).')
    setBusy(true); setErr('')
    try {
      await remote!.verifyCode(email.trim().toLowerCase(), code)
      const user = await remote!.currentUser()
      if (!user) throw new Error('Sign-in didn’t complete. Try the code again.')
      const named = await onSignedIn(user)
      // Returning students go straight in (the app switches screens); new ones continue onboarding.
      setStep(named ? 3 : 2)
    } catch (e) { setErr(friendly(e)) } finally { setBusy(false) }
  }
  // Live mode: the emailed link usually opens in a new tab. Watch for that sign-in so this tab moves on too.
  useEffect(() => {
    if (!LIVE || step !== 1 || !remote) return
    let done = false
    const check = async () => {
      if (done) return
      const user = await remote!.currentUser().catch(() => null)
      if (!user || done) return
      done = true
      const named = await onSignedIn(user)
      setStep(named ? 3 : 2)
    }
    const t = setInterval(check, 2500)
    window.addEventListener('focus', check)
    return () => { done = true; clearInterval(t); window.removeEventListener('focus', check) }
  }, [step])

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
          <button className="btn primary block" disabled={busy}>{busy ? 'Sending…' : LIVE ? 'Email me a sign-in link' : 'Send me a code'}</button>
          {!LIVE && <button type="button" className="btn ghost block" onClick={() => { setEmail(`jellis27@${SCHOOL_DOMAIN}`); setName('Jordan Ellis'); setErr('') }}>Use the demo student</button>}
          <p className="fine">One account per school email. We never post without you choosing to share.</p>
        </form>
      )}

      {step === 1 && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); submitCode() }}>
          <h2>Check your inbox</h2>
          {LIVE
            ? <>
                <p className="muted">We emailed a sign-in code to <b>{email}</b>. Type it below, or click the link in that email <b>on this computer</b>.</p>
                <p className="fine">Not there after a minute? Check spam, junk or quarantine.</p>
              </>
            : <p className="muted">We sent a 6-digit code to <b>{email}</b>.</p>}
          <input className="input code" inputMode="numeric" maxLength={LIVE ? 8 : 6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Verification code" autoFocus />
          {err && <p className="error">{err}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
          {LIVE
            ? <button type="button" className="btn ghost block" disabled={busy} onClick={() => { setCode(''); setStep(0); setSent(false) }}>{sent ? 'Use a different email or resend' : 'Back'}</button>
            : <p className="fine">Prototype: no email is actually sent — any 6 digits work.</p>}
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
          <h2>{LIVE ? 'Connect your music' : 'Connect Spotify'}</h2>
          <p className="muted">Aux reads your recently played, top artists and what’s playing now. You control who sees it.</p>
          {(!LIVE || spotifyConfigured) && (
            <button className={`btn block provider ${me.spotify ? 'done' : ''}`} onClick={connect} disabled={me.spotify}>
              <Icon name={me.spotify ? 'check' : 'headphones'} size={18} /> {me.spotify ? 'Spotify connected' : 'Connect Spotify'}
            </button>
          )}
          {spotifyError && <p className="error">{spotifyError}</p>}
          {LIVE && <LastfmConnect compact />}
          {LIVE && spotifyConfigured && <p className="fine">Spotify sign-in is limited to a few testers for now. Everyone can still share, rate and message songs.</p>}
          {LIVE && !spotifyConfigured && !lastfmConfigured && <p className="fine">You can connect a music account later in Settings. Everything else works without one.</p>}
          {imported !== null && imported > 0 && <p className="ok">Imported {imported} recent plays.</p>}
          {!LIVE && !spotifyConfigured && <p className="fine">Prototype: connecting uses sample listening data until a Spotify client ID is configured.</p>}
          <button className="btn primary block" onClick={() => setStep(5)}>{me.spotify || me.lastfm ? 'Continue' : 'Skip for now'}</button>
        </div>
      )}

      {step === 5 && (
        <div className="card stack">
          <h2>What do you listen to?</h2>
          <p className="muted">Pick your genres. Aux uses them for your picks, and they show on your profile.</p>
          <GenrePicker value={me.genres ?? []} onChange={(genres) => s.updateMe({ genres })} />
          <button className="btn primary block" onClick={() => setStep(4)}>{me.genres?.length ? 'Continue' : 'Skip for now'}</button>
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

      <div className="welcome-foot"><Trophy size={44} /><span className="fine">Home of the Nobles Music Awards</span></div>
    </main>
  )
}

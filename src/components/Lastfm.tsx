import { useState } from 'react'
import { useStore } from '../store'
import { beginLastfmAuth, disconnectLastfm, lastfmConfigured, syncLastfm } from '../services/lastfm'
import { Icon, Sheet } from './ui'

/** Last.fm status and controls (Settings and sign-up). Shows a privacy note before sending the student to Last.fm. */
export function LastfmConnect({ compact = false }: { compact?: boolean }) {
  const me = useStore((s) => s.users.me)
  const [note, setNote] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  if (!lastfmConfigured) return null

  const run = (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setMsg('')
    fn().then((r) => { if (label === 'sync') setMsg(`${(r as { imported?: number })?.imported ?? 0} new plays imported`) })
      .catch((e) => setMsg(e instanceof Error ? e.message : 'Something went wrong'))
      .finally(() => setBusy(''))
  }

  return (
    <>
      {me.lastfm ? (
        compact
          ? <button className="btn block provider done" disabled><Icon name="check" size={18} /> Last.fm connected</button>
          : <>
              <div className="toggle-row">
                <span><b>Last.fm</b><small>Connected as {me.lastfm} · plays sync every 10 minutes</small></span>
                <button className="btn sm" disabled={!!busy} onClick={() => run('disconnect', disconnectLastfm)}>{busy === 'disconnect' ? '…' : 'Disconnect'}</button>
              </div>
              <button className="btn block" disabled={!!busy} onClick={() => run('sync', () => syncLastfm(true))}>{busy === 'sync' ? 'Syncing…' : 'Sync Last.fm now'}</button>
            </>
      ) : compact ? (
        <button className="btn block provider" onClick={() => setNote(true)}><Icon name="headphones" size={18} /> Connect Last.fm</button>
      ) : (
        <div className="toggle-row">
          <span><b>Last.fm</b><small>Works for everyone: link Spotify to Last.fm once and Aux sees what you play</small></span>
          <button className="btn sm primary" onClick={() => setNote(true)}>Connect</button>
        </div>
      )}
      {msg && <p className="fine">{msg}</p>}

      <Sheet open={note} onClose={() => setNote(false)} title="Before you connect Last.fm">
        <div className="stack lastfm-note">
          <p><b>Last.fm is a separate service.</b> If you don’t have an account yet, make one on last.fm, then in Last.fm’s settings connect your Spotify so your plays are tracked.</p>
          <p><b>Last.fm profiles are public by default.</b> Anyone on the internet can see your recent listening on last.fm unless you change that in Last.fm’s privacy settings. Aux’s own privacy setting only controls who sees your plays inside Aux.</p>
          <p><b>You’ll sign in on Last.fm’s website.</b> That proves the account is yours. Aux only reads your recent plays, and you can disconnect anytime.</p>
          <p className="fine">Last.fm has its own minimum age and terms.</p>
          <button className="btn primary block" onClick={beginLastfmAuth}>Continue to Last.fm</button>
          <button className="btn ghost block" onClick={() => setNote(false)}>Not now</button>
        </div>
      </Sheet>
    </>
  )
}

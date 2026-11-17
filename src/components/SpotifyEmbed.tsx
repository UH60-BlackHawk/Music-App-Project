import { useEffect, useRef } from 'react'

/**
 * Spotify's official embedded player, controlled through its iFrame API, used to play a song's "best part".
 * Anyone can use it: people logged in to Spotify in this browser hear the full song (so the clip can start
 * anywhere); everyone else hears Spotify's own 30-second preview, which can't be moved.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Api = { createController(el: HTMLElement, opts: Record<string, unknown>, cb: (c: any) => void): void }
let apiPromise: Promise<Api> | null = null
function loadApi(): Promise<Api> {
  return (apiPromise ??= new Promise<Api>((resolve, reject) => {
    const w = window as any
    w.onSpotifyIframeApiReady = (api: Api) => resolve(api)
    const s = document.createElement('script')
    s.src = 'https://open.spotify.com/embed/iframe-api/v1'
    s.async = true
    s.onerror = () => { apiPromise = null; reject(new Error('Spotify player didn’t load')) }
    document.head.appendChild(s)
  }))
}

export type EmbedNote = 'preview' | 'tap' | null

export function SpotifyEmbed({ spotifyId, start, onProgress, onEnd, onError, onNote }: {
  spotifyId: string; start: number
  onProgress: (fraction: number) => void; onEnd: () => void; onError: () => void; onNote: (n: EmbedNote) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const cbs = useRef({ onProgress, onEnd, onError, onNote })
  cbs.current = { onProgress, onEnd, onError, onNote }

  useEffect(() => {
    let ctrl: any = null
    let gone = false, ready = false, started = false, seeked = false, preview = false, ended = false
    const fail = setTimeout(() => { if (!ready && !gone) cbs.current.onError() }, 8000)
    let nudge: ReturnType<typeof setTimeout> | undefined
    loadApi().then((api) => {
      if (gone || !host.current) return
      const el = document.createElement('div')
      host.current.appendChild(el)
      api.createController(el, { uri: `spotify:track:${spotifyId}`, width: '100%', height: 80 }, (c) => {
        ctrl = c
        c.addListener('ready', () => {
          ready = true
          clearTimeout(fail)
          c.play()
          // Some browsers block starting audio from code: if nothing plays soon, ask the student to tap play.
          nudge = setTimeout(() => { if (!started && !gone) cbs.current.onNote('tap') }, 3500)
        })
        c.addListener('playback_update', (e: { data: { isPaused: boolean; position: number; duration: number } }) => {
          if (gone || ended) return
          const { isPaused, position, duration } = e.data
          if (!isPaused && !started) { started = true; cbs.current.onNote(null) }
          if (!started) return
          if (duration > 0 && duration <= 31000) {
            // Spotify's preview: play it as-is and follow its own progress.
            if (!preview) { preview = true; cbs.current.onNote('preview') }
            cbs.current.onProgress(Math.min(1, position / duration))
            if (position >= duration - 400 || (isPaused && position > 1000)) { ended = true; cbs.current.onEnd() }
            return
          }
          if (!seeked) { seeked = true; if (start > 0) c.seek(Math.floor(start)); return }
          const t = position / 1000 - start
          if (t < -2) return // still seeking
          cbs.current.onProgress(Math.max(0, Math.min(1, t / 30)))
          if (t >= 30) { ended = true; c.pause(); cbs.current.onEnd() }
        })
      })
    }).catch(() => { if (!gone) cbs.current.onError() })
    return () => {
      gone = true
      clearTimeout(fail)
      clearTimeout(nudge)
      try { ctrl?.pause?.(); ctrl?.destroy?.() } catch { /* already gone */ }
      if (host.current) host.current.innerHTML = ''
    }
  }, [spotifyId, start])

  return <div className="spotify-embed" ref={host} />
}

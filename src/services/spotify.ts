/**
 * Real Spotify adapter (Authorization Code + PKCE, no client secret, no backend needed).
 * Active only when VITE_SPOTIFY_CLIENT_ID is set; otherwise the app runs on mock data.
 * Clip playback uses the official Web Playback SDK (Premium required) and only ever
 * seeks within Spotify's own stream — Aux stores track id + start time, never audio.
 */
import type { CatalogExtra, ID } from '../types'
import { albums, artists, findArtist, findTrack, mapGenre, tracks } from '../data/catalog'

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined

/** A Spotify request that failed, with Spotify's own reason. `friendlySpotifyError` turns it into advice. */
export class SpotifyError extends Error {
  constructor(public status: number, public reason: string, public code?: string) { super(`Spotify ${status}: ${reason}`) }
}

/** Plain-language explanation for a failed Spotify connection, with what to do about it. */
export function friendlySpotifyError(e: unknown): string {
  if (!(e instanceof SpotifyError)) return 'Couldn’t reach Spotify. Check your internet connection and try again.'
  const r = e.reason.toLowerCase()
  if (e.status === 403 && /registered|user management|allowlist|developer\.spotify\.com/.test(r))
    return 'Spotify says this account isn’t on the app’s allowed list. In the Spotify developer dashboard, open the Aux app → User Management, add the email of the Spotify account you signed in with, then try again.'
  if (e.status === 403 && /premium/.test(r))
    return 'Spotify says the app owner needs Spotify Premium for apps in Development Mode.'
  if (e.status === 403)
    return `Spotify refused access (${e.reason}). Check the Aux app’s User Management list in the Spotify developer dashboard, and that the app owner has Premium.`
  if (e.code === 'access_denied') return 'Spotify sign-in was cancelled. Press Connect and choose Agree to link your account.'
  if (e.code === 'state_mismatch') return 'The Spotify sign-in didn’t finish in this window. Press Connect again and stay in the same tab.'
  if (e.code === 'invalid_grant') return 'That Spotify sign-in expired before Aux could use it. Press Connect again.'
  if (e.code === 'invalid_client') return 'Spotify didn’t recognise the app. The Client ID in Aux’s settings may not match your Spotify app.'
  if (e.status === 401) return 'Spotify signed you out. Press Connect again.'
  if (e.status === 429) return 'Spotify is busy right now. Wait a minute and try again.'
  return `Spotify returned an error (${e.status}: ${e.reason}).`
}
const REDIRECT = location.origin + location.pathname
const SCOPES = 'user-read-recently-played user-top-read user-read-currently-playing user-read-playback-state user-modify-playback-state streaming user-read-email user-read-private'
const KEY = 'aux-spotify'

export const spotifyConfigured = !!CLIENT_ID
type Tok = { access: string; refresh: string; exp: number }
const load = (): Tok | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
export const spotifyLive = () => spotifyConfigured && !!load()
export const spotifyLogout = () => localStorage.removeItem(KEY)

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function beginSpotifyAuth() {
  if (!CLIENT_ID) return
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)).buffer)
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const state = b64(crypto.getRandomValues(new Uint8Array(16)).buffer)
  sessionStorage.setItem('aux-pkce', verifier)
  sessionStorage.setItem('aux-spotify-state', state)
  // `state` marks this redirect as Spotify's (a Supabase sign-in link also returns `?code=`) and guards against forged returns.
  const q = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge, state })
  location.assign('https://accounts.spotify.com/authorize?' + q)
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new SpotifyError(res.status, j.error_description || j.error || 'token request failed', j.error)
  const tok: Tok = { access: j.access_token, refresh: j.refresh_token ?? load()?.refresh ?? '', exp: Date.now() + j.expires_in * 1000 - 60e3 }
  localStorage.setItem(KEY, JSON.stringify(tok))
  return tok
}

/** Call once on startup: completes the OAuth redirect if `?code=` is present. Returns true if a login completed. */
export async function handleSpotifyCallback() {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const verifier = sessionStorage.getItem('aux-pkce')
  const state = sessionStorage.getItem('aux-spotify-state')
  const denied = params.get('error')
  if (denied && params.get('state')) {
    history.replaceState(null, '', location.pathname + location.hash)
    throw new SpotifyError(400, denied === 'access_denied' ? 'you pressed Cancel' : denied, denied)
  }
  if (!CLIENT_ID || !code || !params.get('state')) return false
  if (!verifier || !state || params.get('state') !== state) {
    // Came back from Spotify, but this tab didn't start the sign-in (or the browser cleared it).
    history.replaceState(null, '', location.pathname + location.hash)
    throw new SpotifyError(400, 'sign-in started in another tab or window', 'state_mismatch')
  }
  sessionStorage.removeItem('aux-pkce')
  sessionStorage.removeItem('aux-spotify-state')
  history.replaceState(null, '', location.pathname + location.hash)
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier })
  return true
}

async function token() {
  let t = load()
  if (!t) throw new Error('Not connected to Spotify')
  if (Date.now() > t.exp) t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })
  return t.access
}
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch('https://api.spotify.com/v1' + path, { ...init, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' } })
  if (!res.ok) {
    // Spotify sends JSON errors, except some Development Mode refusals, which are plain text.
    const text = await res.text().catch(() => '')
    let j: any = null
    try { j = JSON.parse(text) } catch { /* plain text */ }
    throw new SpotifyError(res.status, j?.error?.message || j?.error_description || text.trim().slice(0, 200) || res.statusText || 'request failed')
  }
  return res.status === 204 ? null : res.json().catch(() => null)
}

// ---------- Importing real listening data ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
type SpTrack = { id: string; name: string; duration_ms: number; uri: string; artists: { id: string; name: string }[]; album: { id: string; name: string; release_date?: string } }
type SpArtist = { id: string; name: string; genres?: string[] }

export interface SpotifyImport {
  catalog: CatalogExtra
  /** Real plays with Spotify's own timestamps (recently played covers roughly the last 50 plays). */
  plays: { trackId: ID; at: number }[]
  nowPlaying?: ID
  topArtists: ID[]
  topTracks: ID[]
}

/**
 * Pull the signed-in user's recently played tracks, top tracks and artists, and what's playing now,
 * and turn them into Aux catalog entries. Songs already in the catalog (same title and main artist)
 * reuse the existing id so charts, ratings and classmates' data line up.
 */
export async function importSpotify(): Promise<SpotifyImport> {
  // Each request may fail on its own (Spotify can refuse one endpoint); keep whatever works, but if
  // everything fails, report the first reason so the student sees why.
  let firstError: unknown = null
  const keep = (e: unknown) => { firstError ??= e; return null }
  const [recent, topT, topA, current] = await Promise.all([
    api('/me/player/recently-played?limit=50').catch(keep),
    api('/me/top/tracks?limit=50&time_range=short_term').catch(keep),
    api('/me/top/artists?limit=20&time_range=short_term').catch(keep),
    api('/me/player/currently-playing').catch(keep),
  ])
  if (firstError && !recent && !topT && !topA) throw firstError
  const recentItems: { track: SpTrack; played_at: string }[] = (recent?.items ?? []).filter((i: any) => i?.track?.id)
  const topTracks: SpTrack[] = (topT?.items ?? []).filter((t: any) => t?.id)
  const topArtists: SpArtist[] = topA?.items ?? []
  const currentTrack: SpTrack | null = current?.item?.id ? current.item : null
  const all = [...recentItems.map((i) => i.track), ...topTracks, ...(currentTrack ? [currentTrack] : [])]

  // Genres come from artists. Use what top-artists returned, then look up the rest in batches of 50.
  const genres: Record<string, string[]> = {}
  for (const a of topArtists) genres[a.id] = a.genres ?? []
  const missing = [...new Set(all.map((t) => t.artists[0]?.id).filter((id) => id && !(id in genres)))]
  for (let k = 0; k < missing.length; k += 50) {
    const j = await api(`/artists?ids=${missing.slice(k, k + 50).join(',')}`).catch(() => null)
    for (const a of (j?.artists ?? []) as SpArtist[]) if (a) genres[a.id] = a.genres ?? []
  }

  const catalog: CatalogExtra = { artists: [], albums: [], tracks: [] }
  const seen: Record<string, ID> = {}
  const artistIdFor = (a: { id: string; name: string }) => {
    const existing = findArtist(a.name)
    if (existing) return existing.id
    const id = 'ar-sp-' + a.id
    if (!artists[id] && !catalog.artists.some((x) => x.id === id)) catalog.artists.push({ id, name: a.name, genre: mapGenre(genres[a.id]), spotifyId: a.id })
    return id
  }
  const toId = (t: SpTrack): ID => {
    if (seen[t.id]) return seen[t.id]
    const main = t.artists[0] ?? { id: 'unknown', name: 'Unknown artist' }
    const existing = findTrack(t.name, main.name)
    if (existing) return (seen[t.id] = existing.id)
    const artistId = artistIdFor(main)
    const albumId = 'al-sp-' + t.album.id
    if (!albums[albumId] && !catalog.albums.some((x) => x.id === albumId))
      catalog.albums.push({ id: albumId, title: t.album.name, artistId, year: Number((t.album.release_date ?? '').slice(0, 4)) || 0, spotifyId: t.album.id })
    const id = 't-sp-' + t.id
    if (!tracks[id]) catalog.tracks.push({ id, title: t.name, artistId, albumId, dur: Math.round(t.duration_ms / 1000), spotifyId: t.id })
    return (seen[t.id] = id)
  }

  const plays = recentItems.map((i) => ({ trackId: toId(i.track), at: Date.parse(i.played_at) }))
  return {
    catalog,
    plays,
    nowPlaying: currentTrack ? toId(currentTrack) : undefined,
    topTracks: topTracks.map(toId),
    topArtists: topArtists.map((a) => artistIdFor(a)),
  }
}

const uriCache: Record<string, string> = {}
async function resolveUri(title: string, artist: string) {
  const k = `${title}|${artist}`
  if (!uriCache[k]) {
    const j = await api(`/search?type=track&limit=1&q=${encodeURIComponent(`track:${title} artist:${artist}`)}`)
    uriCache[k] = j?.tracks?.items?.[0]?.uri ?? ''
  }
  return uriCache[k]
}

let devicePromise: Promise<string> | null = null
let stopTimer: number | undefined
function device(): Promise<string> {
  return (devicePromise ??= new Promise((resolve, reject) => {
    const w = window as any
    w.onSpotifyWebPlaybackSDKReady = () => {
      const player = new w.Spotify.Player({ name: 'Aux', getOAuthToken: (cb: (t: string) => void) => token().then(cb), volume: 0.8 })
      player.addListener('ready', ({ device_id }: { device_id: string }) => resolve(device_id))
      player.addListener('initialization_error', reject)
      player.addListener('account_error', reject) // e.g. not Premium → caller falls back to deep link
      player.connect()
    }
    const sc = document.createElement('script')
    sc.src = 'https://sdk.scdn.co/spotify-player.js'
    sc.onerror = reject
    document.head.appendChild(sc)
  }))
}

/** Play a 30-second "best part" by seeking the official stream to `startSec`. */
export async function playClip(song: { title: string; artist: string; spotifyId?: string }, startSec: number) {
  const [id, uri] = await Promise.all([device(), song.spotifyId ? `spotify:track:${song.spotifyId}` : resolveUri(song.title, song.artist)])
  if (!uri) throw new Error('Track not found on Spotify')
  await api(`/me/player/play?device_id=${id}`, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: Math.round(startSec * 1000) }) })
  clearTimeout(stopTimer)
  stopTimer = window.setTimeout(() => stopClip(), 30_000)
}
export async function stopClip() {
  clearTimeout(stopTimer)
  if (devicePromise) await api('/me/player/pause', { method: 'PUT' }).catch(() => {})
}

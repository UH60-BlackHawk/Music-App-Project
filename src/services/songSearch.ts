import { useEffect, useState } from 'react'
import type { CatalogExtra } from '../types'
import { remote } from './remote'
import { LIVE } from './mode'

export interface SongResult { id: string; title: string; artist: string; album: string; dur: number; spotifyId: string; isNew: boolean }
interface SearchResponse { results: SongResult[]; catalog: CatalogExtra }

/** Pull a Spotify track id out of a pasted link (open.spotify.com/track/…, spotify:track:…). Mirrors the server's version. */
export const spotifyIdFromLink = (text: string) =>
  text.trim().match(/(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/|spotify:track:)([A-Za-z0-9]{10,30})/)?.[1] ?? null

/**
 * Search all of Spotify through the server (live mode only), debounced. A pasted Spotify link looks up that song.
 * Returns results plus the catalog rows needed to add a picked song to Aux.
 */
export function useSpotifySearch(q: string) {
  const [state, setState] = useState<{ loading: boolean; error: string; data: SearchResponse | null }>({ loading: false, error: '', data: null })
  useEffect(() => {
    const text = q.trim()
    if (!LIVE || !remote || text.length < 2) return setState({ loading: false, error: '', data: null })
    let live = true
    setState((s) => ({ ...s, loading: true, error: '' }))
    const t = setTimeout(() => {
      remote!.invoke<SearchResponse>('spotify', { action: 'search', q: text })
        .then((data) => { if (live) setState({ loading: false, error: '', data }) })
        .catch((e) => { if (live) setState({ loading: false, error: e instanceof Error ? e.message : 'Search failed', data: null }) })
    }, spotifyIdFromLink(text) ? 0 : 350)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  return state
}

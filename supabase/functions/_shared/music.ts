// Song-matching helpers shared by the server functions.
// mapGenre and cleanTitle mirror the same-named logic in src/data/catalog.ts; keep them in step.

/** Lower-case, drop "(feat. …)", "[…]" and "- 2004 Remaster" style suffixes, collapse punctuation. */
export const cleanTitle = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)|\[.*?\]|- .*remaster.*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const GENRE_RULES: [RegExp, string][] = [
  [/hyperpop|digicore|glitchcore/, 'hyperpop'],
  [/emo|pop punk|punk|post-hardcore|screamo/, 'emo'],
  [/hip hop|rap|trap|drill|grime/, 'hip-hop'],
  [/r&b|rnb|soul|neo soul|funk/, 'r&b'],
  [/folk|country|americana|bluegrass|singer-songwriter/, 'folk'],
  [/jazz|swing|big band|motown|doo-wop|classic rock|soft rock|oldies|disco|yacht rock|classical/, 'classic'],
  [/indie|bedroom|lo-fi|shoegaze|dream pop|chamber/, 'indie'],
  [/rock|metal|grunge|garage|psych|alternative/, 'rock'],
  [/pop|dance|electro|house|edm/, 'pop'],
]
/** Map Spotify's free-text artist genres onto Aux's nine genres. Unknown → pop. */
export function mapGenre(genres: string[] = []): string {
  for (const g of genres) for (const [re, id] of GENRE_RULES) if (re.test(g.toLowerCase())) return id
  return 'pop'
}

/** A short stable id fragment from text (for songs that exist only on Last.fm). */
export function shortHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

export interface CatalogArtist { id: string; name: string; genre: string; spotifyId?: string }
export interface CatalogAlbum { id: string; title: string; artistId: string; year: number; spotifyId?: string }
export interface CatalogTrack { id: string; title: string; artistId: string; albumId: string; dur: number; spotifyId?: string }
export interface CatalogBundle { artists: CatalogArtist[]; albums: CatalogAlbum[]; tracks: CatalogTrack[] }
export const emptyBundle = (): CatalogBundle => ({ artists: [], albums: [], tracks: [] })

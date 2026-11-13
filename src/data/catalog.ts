import type { Album, Artist, ID, Track } from '../types'

// Mock catalog. Titles/artists are real so the prototype feels alive; durations are approximate.
// Cover art is generated (see Cover component) — no copyrighted artwork or audio is bundled.
type Raw = [artist: string, genre: string, album: string, year: number, tracks: [string, number][]]

const RAW: Raw[] = [
  ['Sabrina Carpenter', 'pop', "Short n' Sweet", 2024, [['Espresso', 175], ['Please Please Please', 186], ['Taste', 157]]],
  ['Chappell Roan', 'pop', 'The Rise and Fall of a Midwest Princess', 2023, [['Pink Pony Club', 258], ['Red Wine Supernova', 192]]],
  ['Kendrick Lamar', 'hip-hop', 'GNX', 2024, [['luther', 178], ['tv off', 220], ['squabble up', 157]]],
  ['SZA', 'r&b', 'SOS', 2022, [['Kill Bill', 153], ['Snooze', 201]]],
  ['Tyler, The Creator', 'hip-hop', 'CHROMAKOPIA', 2024, [['Sticky', 255], ['Like Him', 278]]],
  ['Phoebe Bridgers', 'indie', 'Punisher', 2020, [['Kyoto', 184], ['I Know the End', 344]]],
  ['Clairo', 'indie', 'Charm', 2024, [['Juna', 197], ['Sexy to Someone', 207]]],
  ['Noah Kahan', 'folk', 'Stick Season', 2022, [['Stick Season', 182], ['Northern Attitude', 267]]],
  ['Zach Bryan', 'folk', 'American Heartbreak', 2022, [['Something in the Orange', 228]]],
  ['Olivia Rodrigo', 'pop', 'GUTS', 2023, [['vampire', 219], ['bad idea right?', 184]]],
  ['Billie Eilish', 'pop', 'HIT ME HARD AND SOFT', 2024, [['BIRDS OF A FEATHER', 210], ['CHIHIRO', 303]]],
  ['The Weeknd', 'r&b', 'After Hours', 2020, [['Blinding Lights', 200]]],
  ['Frank Ocean', 'r&b', 'Blonde', 2016, [['Nights', 307], ['Pink + White', 184]]],
  ['Mac Miller', 'hip-hop', 'Swimming', 2018, [['Self Care', 345], ['2009', 347]]],
  ['Fleetwood Mac', 'classic', 'Rumours', 1977, [['Dreams', 257], ['The Chain', 270]]],
  ['Arctic Monkeys', 'rock', 'AM', 2013, [['Do I Wanna Know?', 272], ['R U Mine?', 201]]],
  ['Charli xcx', 'hyperpop', 'BRAT', 2024, [['360', 133], ['Apple', 151]]],
  ['Travis Scott', 'hip-hop', 'ASTROWORLD', 2018, [['SICKO MODE', 312]]],
  ['Taylor Swift', 'pop', 'folklore', 2020, [['august', 261], ['cardigan', 239]]],
  ['Mk.gee', 'indie', 'Two Star & The Dream Police', 2024, [['Are You Looking Up', 224]]],
  ['Outkast', 'classic', 'Speakerboxxx/The Love Below', 2003, [['Hey Ya!', 235]]],
  ['Paramore', 'emo', 'Riot!', 2007, [['Misery Business', 211]]],
  ['My Chemical Romance', 'emo', 'The Black Parade', 2006, [['Welcome to the Black Parade', 311]]],
  ['beabadoobee', 'indie', 'This Is How Tomorrow Moves', 2024, [['Take a Bite', 196]]],
  ['Daniel Caesar', 'r&b', 'Freudian', 2017, [['Best Part', 209]]],
  ['Gracie Abrams', 'pop', 'The Secret of Us', 2024, [["That's So True", 166], ['Risk', 187]]],
  ['Lorde', 'indie', 'Pure Heroine', 2013, [['Ribs', 258]]],
  ['Bon Iver', 'folk', 'For Emma, Forever Ago', 2007, [['Skinny Love', 238]]],
  ['Doechii', 'hip-hop', 'Alligator Bites Never Heal', 2024, [['DENIAL IS A RIVER', 159]]],
  ['Tame Impala', 'rock', 'Currents', 2015, [['The Less I Know the Better', 216]]],
]

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const artists: Record<ID, Artist> = {}
export const albums: Record<ID, Album> = {}
export const tracks: Record<ID, Track> = {}

for (const [artist, genre, album, year, ts] of RAW) {
  const artistId = 'ar-' + slug(artist)
  const albumId = 'al-' + slug(album)
  artists[artistId] = { id: artistId, name: artist, genre }
  albums[albumId] = { id: albumId, title: album, artistId, year }
  for (const [title, dur] of ts) {
    const id = 't-' + slug(title)
    tracks[id] = { id, title, artistId, albumId, dur }
  }
}

export const trackList = Object.values(tracks)
export const albumList = Object.values(albums)
export const artistList = Object.values(artists)

export const artistOf = (t: Track) => artists[t.artistId]
export const albumOf = (t: Track) => albums[t.albumId]
export const albumTracks = (albumId: ID) => trackList.filter((t) => t.albumId === albumId)
export const tid = (title: string) => 't-' + slug(title)
export const alid = (title: string) => 'al-' + slug(title)

export const itemTitle = (type: 'track' | 'album', id: ID) => (type === 'track' ? tracks[id]?.title : albums[id]?.title) ?? 'Unknown'
export const itemArtist = (type: 'track' | 'album', id: ID) =>
  artists[(type === 'track' ? tracks[id]?.artistId : albums[id]?.artistId) ?? '']?.name ?? ''

export const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export const spotifyLink = (t: Track) => `https://open.spotify.com/search/${encodeURIComponent(`${t.title} ${artistOf(t).name}`)}`

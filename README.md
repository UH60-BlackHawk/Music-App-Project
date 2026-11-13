# Aux

A social music app prototype for students at Noble and Greenough School. Whoever has the aux picks the music: share what you're listening to, discover songs through friends, recommend a track with its 30-second "best part", rate and review, climb the Nobles charts, and run the Noble Music Awards (NMAs).

This is a mobile-first web prototype. It runs entirely in the browser on seeded sample data, so it feels alive before any real accounts are connected.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Or in VS Code: open this folder and press F5 ("Run Aux"). It installs dependencies, starts the dev server and opens the app in your default browser.

Sign in with any `@nobles.edu` address (or tap "Use the demo student"); any 6 digits work as the code. "Reset demo data" in Settings starts over.

## What's in the prototype

| Area | Status |
| --- | --- |
| School-email sign-in, onboarding, privacy choice | Working (no real email is sent) |
| Spotify / Apple Music connection | Sample data by default. A real Spotify PKCE adapter is included and switches on with `VITE_SPOTIFY_CLIENT_ID`; it has not been tested against a live Spotify app. Apple Music is a documented stub (MusicKit needs a server-signed developer token). |
| Profiles, follows, home feed, privacy (school / friends / private, pause sharing) | Working |
| For You + Your Friends Are Into, each with a reason | Working, computed from in-app data only (`src/lib/recs.ts`) |
| Recommend a song with a 30s best-part scrubber | Working. Stores track id + start second only. Playback is simulated in sample mode, with deep links to Spotify and Apple Music. |
| Ratings and reviews (half stars), Nobles averages | Working |
| Song / Album of the Day (manual or automatic), reactions, comments | Working |
| Nobles Leaderboard (week / month / all time, Trending) | Working, opted-in users only, aggregate counts only |
| NMAs: nominations, voting, animated reveal, Castle Hall of Fame, badges | Working. Classmates' nominations and votes are simulated. |
| Award predictions with free points | Working, with sample nominees entered through Admin |
| Report, block, basic language filter, admin dashboard | Working |
| Seven themes with instant switching | Working |

## Stack

- Vite, React 18, TypeScript
- Zustand store persisted to `localStorage` (stands in for a backend)
- React Router with hash routing, so the build can be hosted on any static host
- Plain CSS driven by design tokens

Suggested production backend: Supabase (Postgres, email auth restricted to the school domain, row-level security enforcing the privacy rules).

## Layout

```
src/
  types.ts            data model
  store.ts            state + every mutation (the seam where a real API goes)
  data/catalog.ts     sample songs, albums, artists
  data/seed.ts        sample students and generated listening history
  lib/select.ts       privacy rule (canSee), feed, leaderboard, daily pick, moderation
  lib/recs.ts         recommendation scoring and reasons
  services/           Spotify adapter (PKCE + Web Playback SDK), Apple Music stub
  components/         shared UI, wordmark, Golden Bulldog trophy
  screens/            one file per screen
  styles/themes.css   theme tokens
  styles/base.css     structure, reads tokens only
```

## Data model

- **User**: name, handle, school email, class year, privacy (`school` / `friends` / `private`), sharingPaused, leaderboardOptIn, connected providers, favorite albums, badges
- **Follow**: `[from, to]`; "friends" means a mutual follow
- **Listen**: user, track, timestamp
- **Rating**: user, song or album, stars (0.5 to 5), optional review
- **Rec**: from, to (a friend, or `null` for the feed), track, `clipStart` seconds, note. No audio is ever stored.
- **Comment / Reaction / Report / blocks**
- **DailyConfig**: manual or automatic, metric (most shared / highest rated in 24h)
- **Nma**: season, phase, categories, nominations, votes, proposals, ballot, winners, hall of fame, integrity flags
- **PredEvent / Pick**: events, categories, nominees, winner; picks lock at start time

## Themes

Each theme is one block of CSS variables in `src/styles/themes.css` covering colour, type, radius, texture, icon stroke, motion, the wordmark and the trophy. To add one, copy a block, change the values, and add an entry to `THEMES` in `src/components/Brand.tsx`.

## Embedding

Append `?embed=1` to drop the phone-width frame so Aux can sit inside another app's web view. No school API is assumed anywhere.

## Real Spotify

Copy `.env.example` to `.env`, set `VITE_SPOTIFY_CLIENT_ID`, and register the app's URL as a redirect URI in the Spotify developer dashboard. Clip playback through the Web Playback SDK needs Spotify Premium; otherwise the deep link is used.

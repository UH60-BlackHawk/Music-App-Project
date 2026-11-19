# Aux

A social music app prototype for students at Noble and Greenough School. Whoever has the aux picks the music: share what you're listening to, discover songs through friends, recommend a track with its 30-second "best part", rate and review, climb the Nobles charts, and run the Nobles Music Awards (NMAs).

This is a mobile-first web prototype. It runs entirely in the browser on seeded sample data, so it feels alive before any real accounts are connected.

## Run it

```bash
npm install
```

```bash
npm run dev
```

The app runs at http://127.0.0.1:5173/ (Spotify requires `127.0.0.1` rather than `localhost`).

In VS Code there are two options in Run and Debug: **Run Aux** (sample data) and **Run Aux (live backend)** (connected to the Supabase project; settings in `.env.live`).

Or in VS Code: open this folder and press F5 ("Run Aux"). It installs dependencies, starts the dev server and opens the app in your default browser.

Sign in with any `@nobles.edu` address (or tap "Use the demo student"); any 6 digits work as the code. "Reset demo data" in Settings starts over.

## What's in the prototype

| Area | Status |
| --- | --- |
| School-email sign-in, onboarding, privacy choice | Working (no real email is sent) |
| Last.fm listening history (live mode) | Students link their Last.fm account (signing in on Last.fm, with a privacy note first); plays import automatically. Works for any number of students. |
| Spotify connection | Sample data by default. With `VITE_SPOTIFY_CLIENT_ID` set, "Connect Spotify" signs in for real and imports recent plays, top tracks and artists, and what's playing; they feed your profile, charts and recommendations, and resync every 10 minutes or on "Sync now". Tested against simulated Spotify responses, not yet a live Spotify app. Apple Music is not included for now. |
| Profiles (with optional uploaded photo, cropped in the app), follows (with follower / following lists), home feed, privacy (school / friends / private, pause sharing) | Working |
| For You + Your Friends Are Into, each with a reason | Working, computed from in-app data only (`src/lib/recs.ts`); favourite genres boost picks |
| Genre preferences (onboarding and Settings, shown on profiles) and genre filters on Charts and Discover, including a "My genres" shortcut | Working |
| Recommend a song with a 30s best-part scrubber | Working. Stores track id + start second only. Sample mode shows a visual preview with an "Open in Spotify" link; live mode plays the clip in Spotify's embedded player. |
| Ratings and reviews (half stars), Nobles averages | Working |
| Share a song (pick several classmates, add a message; plus best part, post to feed, copy link, Spotify, system share) | Working |
| Messages: direct messages that are songs only, with an optional note, unread badges and per-person chats | Working. Classmates sometimes send a song back a few seconds later (simulated). |
| Song / Album of the Day (manual or automatic), inline rating, comments | Working |
| Nobles Leaderboard (week / month / all time, Trending) | Working, opted-in users only, aggregate counts only |
| NMAs: nominations, voting, animated reveal, Castle Hall of Fame, badges | Working. Classmates' nominations and votes are simulated. |
| Award predictions with free points | Working, with sample nominees entered through Admin |
| Report, block, basic language filter, admin dashboard | Working |
| 23 themes in five categories, with instant switching | Working |

## Stack

- Vite, React 18, TypeScript
- Zustand store persisted to `localStorage` (stands in for a backend)
- React Router with hash routing, so the build can be hosted on any static host
- Plain CSS driven by design tokens

## Backend (in progress)

The backend is **Supabase** (hosted Postgres with built-in email sign-in and realtime updates). Status:

- **Done:** the app connects to Supabase when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set ("live mode"): real sign-in by emailed link or code, everything loads from and saves to the database, new messages arrive live, and charts and prediction points come from server totals. Without those settings it runs on sample data as before.
- **Done:** the database schema with security rules, in `supabase/migrations/`. School-email-only sign-up, privacy settings, blocking, who can message whom, sealed NMA votes, prediction lock times and admin-only moderation are enforced by the database itself. 33 automated tests cover them (`npm run test:db`, see `docs/SETUP.md`).
- **Done:** server functions (Supabase Edge Functions, `supabase/functions/`) for searching all of Spotify and looking up pasted song links (app-only Spotify access, so no 5-person limit), and for Last.fm: students sign in on Last.fm to prove the account is theirs, then recent plays import every 10 minutes or on demand. Tested against stand-in Spotify and Last.fm services (`npm run test:functions`).
- **Done:** best-part clips play through Spotify's official embedded player for anyone (jumping to the chosen 30 seconds and stopping after them); students logged in to Spotify in their browser hear the full song, others hear Spotify's 30-second preview. Testers signed in with Spotify keep full playback. Tested against a stand-in for Spotify's player script.
- **Next:** hosting the app online so classmates can open it, and an email-sending service so students can receive sign-in emails.
- **Setup steps** for the Spotify and Supabase accounts are in [`docs/SETUP.md`](docs/SETUP.md).

## Layout

```
src/
  types.ts            data model
  store.ts            state + every mutation (the seam where a real API goes)
  data/catalog.ts     sample songs, albums, artists
  data/seed.ts        sample students and generated listening history
  lib/select.ts       privacy rule (canSee), feed, leaderboard, daily pick, moderation
  lib/recs.ts         recommendation scoring and reasons
  services/           backend connection (remote.ts, live.ts), Spotify sign-in, import and playback
supabase/
  migrations/         database schema and security rules
  functions/          server functions: spotify (search, links), lastfm (sign-in, import)
  tests/              security-rule tests (run with npm run test:db)
docs/SETUP.md         account setup steps for Spotify and Supabase
  components/         shared UI, wordmark, Golden Bulldog trophy
  screens/            one file per screen
  styles/themes.css   theme tokens
  styles/base.css     structure, reads tokens only
```

## Data model

- **User**: name, handle, school email, class year, optional photo (a small square JPEG, about 10 KB), favourite genres, privacy (`school` / `friends` / `private`), sharingPaused, leaderboardOptIn, connected providers, favorite albums, badges
- **Follow**: `[from, to]`; "friends" means a mutual follow
- **Listen**: user, track, timestamp
- **Rating**: user, song or album, stars (0.5 to 5), optional review
- **Rec**: a song sent by a student. `to` is a classmate (a direct message) or `null` (a feed post); `clipStart` is the best-part start in seconds, or `null` for a plain share; `read` marks incoming messages as seen. No audio is ever stored.
- **Comment / Reaction / Report / blocks**
- **DailyConfig**: manual or automatic, metric (most shared / highest rated in 24h)
- **Nma**: season, phase, categories, nominations, votes, proposals, ballot, winners, hall of fame, integrity flags
- **PredEvent / Pick**: events, categories, nominees, winner; picks lock at start time

## Themes

Each theme is one block of CSS variables in `src/styles/themes.css` covering colour, type, texture, icon stroke, motion, the wordmark and the trophy, plus shape and ornament: card outline and corner art, cover shape (records, portholes, shields, arches, leaves), the rule under section headings, and the nav bar style. The first block holds the defaults; every other theme only overrides what differs. To add one, add a block, add its id to `ThemeId` in `src/types.ts`, and add an entry (with its category) to `THEMES` in `src/components/Brand.tsx`.

## Embedding

Append `?embed=1` to drop the phone-width frame so Aux can sit inside another app's web view. No school API is assumed anywhere.

## Real Spotify

Copy `.env.example` to `.env`, set `VITE_SPOTIFY_CLIENT_ID`, and register the app's URL as a redirect URI in the Spotify developer dashboard. Clip playback through the Web Playback SDK needs Spotify Premium; otherwise the deep link is used.

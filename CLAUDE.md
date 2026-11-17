# Aux — notes for Claude

Aux is a social music app prototype for students at Noble and Greenough School ("Nobles", Dedham MA). The name is from "passing the aux". Read `README.md` for the feature table, stack, data model and file layout; this file holds the decisions and working rules that are easy to forget.

## Working agreement

- Work in this repo, on the `aux-prototype` branch. `main` only has the initial commit. Commit and push when a piece of work is done; do not open a pull request unless asked.
- The owner is not an experienced developer. Explain things in plain language, and give exact click-by-click or copy-paste steps. They are on a Mac and run the app from VS Code with F5 (`.vscode/launch.json`).
- Keep `README.md` in step with the code whenever a feature is added or removed.
- **Keep this file current, continuously.** The owner asked for this explicitly. Every commit that adds, removes or changes a feature, records a product decision or owner preference, renames something, changes what is simulated, bumps the storage key, or uncovers a technical gotcha must update `CLAUDE.md` in that same commit. Before committing, reread the sections you touched and fix anything that has gone stale. When you tell the owner what you did, say what changed in this file.

## Product decisions so far

- **Sign-in** is limited to `@nobles.edu` (`SCHOOL_DOMAIN` in `src/screens/Welcome.tsx`). No email is really sent; any 6 digits pass.
- **Spotify's limits (as of a July 2026 Spotify developer post; confirm on the dashboard):** an app in Development Mode allows only 5 allowlisted users and the app owner needs Premium; Extended Quota (more users) is reserved for established businesses with large user bases, which a school project won't meet. So Spotify sign-in is an optional extra for the owner and a few testers. Aux must stay fully usable without Spotify.
- **The app runs on `http://127.0.0.1:5173/`, not `localhost`.** Spotify rejects `localhost` redirect URIs. Browser storage is per address, so data saved under `localhost` doesn't carry over.
- **Spotify only.** Apple Music was removed on request. It may come back later, so keep provider logic easy to extend, but do not add Apple Music UI, links or copy until asked.
- **Listening Party was removed** on request. Do not re-add it.
- **Recommendations** are computed from in-app data only (`src/lib/recs.ts`), never Spotify's recommendations endpoint, and every suggestion shows a reason.
- **Best-part clips** store a track id and start second only. Never store or bundle audio.
- **Leaderboard** uses opted-in users only and shows aggregate counts, never who listened to what.
- **Privacy** goes through one function, `canSee` in `src/lib/select.ts`. Any new surface that shows a person's activity must use it. Follower / following lists are visible on every profile (blocked users hidden).
- **Naming**: the school's nickname is "Nobles", never "Noble". The awards are the "Nobles Music Awards" (NMAs). Only the full name "Noble and Greenough School" uses the singular.
- **NMAs**: results stay hidden until the reveal; one vote per student per category; winners get a Golden Bulldog shown on the item page and the nominator's profile.
- **Sharing and Messages.** The Share sheet (`src/components/Share.tsx`) is modelled on Instagram's Send (multi-select people, optional message, one send) with an Apple-style action row. Messages (`src/screens/Messages.tsx`) are songs only: every message must carry a song, the note is optional, and there are no text-only messages. A direct message is just a `Rec` with a `toId`, so the "Sent to you" section, the best-part Recommend flow and the chats all share one record. Who you can send to is `shareContacts` in `select.ts` (recent chats, then people you follow; blocked people never). Notes go through `moderate`, and incoming messages have a report button.
- **Predictions** award free points only. No money or purchasable currency, ever.
- **No emoji reactions.** They were removed on request. Song of the Day, recommendation cards and incoming chat messages carry an inline star rating (`QuickRate`) instead; the full rating and review form stays on the song / album page.
- **No emoji characters anywhere in the UI.** Use the `Icon` component (`ICONS` in `src/components/ui.tsx`) so icons follow the theme's stroke style. Award categories and badges store an icon name, not an emoji. The ★ rating glyphs are the one exception.
- **Profile photos** are optional (`photo` on `User`, edited with `ProfilePhoto` in `src/components/Photo.tsx` on your profile and in Settings). The crop step saves a 320 px square JPEG data URL (about 10 KB) so it fits in browser storage; never store the original file. `Avatar` shows the photo or falls back to initials. In admin moderation, "Remove photo" on a reported profile takes the photo down.
- **Genres.** The genre list and labels live in `GENRES` in `src/data/catalog.ts`; every artist has one genre and songs and albums inherit it. Students pick favourites (`genres` on `User`) during onboarding and in Settings; they show on profiles, add a "Because you like …" boost in `forYou`, and power the "My genres" option of `GenreFilterBar`. Charts (`leaderboard`, `trending`) and Discover (`forYou`, `friendsInto`) take a `GenreFilter` ('all' | 'mine' | a genre id). To add a genre, add it to `GENRES` and give artists that genre.
- **Cover art is generated** (`Cover` in `src/components/ui.tsx`). Do not add real album artwork.
- **No school API is assumed.** `?embed=1` drops the phone frame for future embedding in the Nobles app.

## What is simulated

- Everything runs in the browser; state is a Zustand store persisted to `localStorage` under `aux-v3`, saved-data version 1 (`src/store.ts`). There is no backend, so nothing is shared between devices. The Supabase backend is being built (see Backend below).
- The other students, their listens, nominations, votes and prediction picks are seeded (`src/data/seed.ts`).
- Connecting Spotify imports sample listens unless `VITE_SPOTIFY_CLIENT_ID` is set. With it set, sign-in is real (PKCE, `src/services/spotify.ts`) and `importSpotify` pulls recent plays (Spotify only returns the last 50), top tracks and artists, and now playing. `applySpotifyImport` in `store.ts` adds unknown songs to the catalog (`catalogExtra`, ids `t-sp-…`/`al-sp-…`/`ar-sp-…`, re-registered on load), reuses catalog ids for songs already there (`findTrack` ignores case, "(feat. …)" and "- Remaster"), replaces the sample plays with real ones the first time, and merges later syncs without duplicates. Spotify's free-text genres map to Aux genres via `mapGenre` in `catalog.ts`. Sync runs on startup if older than 10 minutes and from "Sync now" in Settings (`src/services/spotifySync.ts`). This has been tested against simulated Spotify responses only, not a live Spotify app.
- Replies in Messages are simulated: after you send someone a song, there is a 70% chance they send one back 3–7 seconds later (`simulateReply` in `store.ts`). Remove this when a real backend exists.
- Admin mode is a Settings toggle, on by default, so the awards phases can be advanced in the demo.

## Backend (Supabase)

- **Status:** schema and security rules are written and tested (`supabase/migrations/0001_init.sql`, tests in `supabase/tests/rls.test.mjs`, run with `npm run test:db` against an empty local Postgres; the test wipes it). The app is **not yet connected**: it still runs entirely on the local Zustand store. Next steps: Supabase client and email-code sign-in, load/save every store action through the database, Realtime for Messages, then hosting.
- **Waiting on the owner** for: the Spotify Client ID, and the Supabase Project URL and publishable (anon) key. Those three are safe to receive in chat. Never ask for or accept the Supabase `service_role`/secret key, the database password or the Spotify client secret; the owner keeps those. Setup steps for the owner are in `docs/SETUP.md`; keep that file current when steps change.
- The rules mirror the app: `can_see()` = `canSee`, `can_message()` = `shareContacts`. When a product rule changes, change both, and add a test.
- Aggregates that read across students (leaderboard, item ratings, NMA results, prediction points) are `security definer` functions that return totals only. NMA votes are unreadable by anyone, admins included, until `nma_results` works after the reveal.
- `protect_profile_columns` blocks students from changing `is_admin`, `badges` or `email`; changes with no signed-in user (SQL editor, server code) are trusted, which is how the owner makes the first admin: `update profiles set is_admin = true where email = '…@nobles.edu';`.
- Local testing: Postgres 16 is available in the cloud container (`pg_ctlcluster 16 main start`); `supabase/tests/stub_supabase.sql` stands in for Supabase's `auth` schema and roles.
- The school has students under 18 (some under 13). Before real students beyond a few testers use it, the owner should check with the school; `docs/SETUP.md` says so.

## Themes

- Themes are CSS-variable token blocks in `src/styles/themes.css`. `src/styles/base.css` must only read tokens: no hard-coded colours, fonts or radii there.
- The first block (`:root, [data-theme]`) is the Nobles default and the fallback for every token. Other themes override what differs.
- To add a theme: add a block in `themes.css`, add the id to `ThemeId` in `src/types.ts`, add an entry to `THEMES` in `src/components/Brand.tsx` with one of the `THEME_CATEGORIES` (Classic, Music scenes, Fantasy & storybook, Nature, Seasonal), and load any new fonts in `index.html`. Optionally add a trophy accessory and a header motif in `Brand.tsx`.
- Settings previews nest a different `data-theme` on each swatch, so theme styling must come from tokens. A selector like `[data-theme='x'] .thing` also matches inside a swatch nested under theme x, so only use one for classes that never appear in a swatch.
- A theme should differ in shape and ornament, not just colour and font. The levers, all tokens: `--card-shape` and `--card-art` (card outline and corner art), `--cover-shape` / `--cover-clip` / `--cover-border` (round records, portholes, shields, arches, leaves), `--head-rule` (the decorative line under section headings), and the `--nav-*` set (floating pill, coloured bar). The owner called earlier recolour-only themes "lazy", so use these when adding or revising a theme, and keep neighbours distinct (Fleur is pink stationery with arched covers, Garden is a dark greenhouse with leaf shapes, Spring is a gingham picnic).
- **Dark Fantasy** is a moonlit keep (indigo, silver, amethyst). No blood, bone or other gruesome imagery, in the styling or the copy.
- **Liquid Glass** is frosted floating panels over a colourful wallpaper, with a floating pill nav. It is not a sky-and-clouds theme, and it uses no Apple assets or names.
- **Jazz Club** should stay gold-forward and not too dark.
- Keep decoration out from under text: hero-card ornaments belong in corners that hold no controls (the Song/Album toggle is top-right, the rating row is at the bottom).
- Every theme must keep readable contrast: check body text, muted text, text on `--accent`, and text and stars inside hero cards (`--hero-*`).
- Themes inspired by existing properties (the wizarding-school and hand-drawn-cartoon ones) borrow a mood only. Do not use their names, logos, characters or lookalike fonts.

## Technical gotchas

- `.screen` has an entry animation, which makes it the containing block for `position: fixed` children. Full-screen overlays and sheets must be portalled to `document.body` (see `Sheet` and `Ceremony`).
- `.hero` and `.ceremony` remap tokens (`--text`, `--accent`, `--surface`…) to the `--hero-*` set, so components inside them restyle automatically.
- Do not change the shape of persisted state casually: existing browsers keep old data. Removing fields and adding optional ones is safe. To fill in or reshape saved data, bump `version` in the persist options in `src/store.ts` and add a step to `migrate` (v1 added classmates' genres this way). Renaming the storage key wipes everyone's demo, including their photo, so only do that for changes a migration can't handle.
- Class names are global: check `base.css` before naming a new one. A new `.badge` class once collided with the award-badge chips and hid their labels; the unread counter is `.count-badge`.

## Verifying changes

```bash
npm run build
```

That type-checks and builds. There are no automated tests. For UI changes, also run the app (`npm run dev`, or `npx vite preview` after a build) and click through the affected screens in a headless browser at phone size (390×844), checking for console errors, in the default theme and at least one dark theme.

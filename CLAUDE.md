# Aux — notes for Claude

Aux is a social music app prototype for students at Noble and Greenough School ("Nobles", Dedham MA). The name is from "passing the aux". Read `README.md` for the feature table, stack, data model and file layout; this file holds the decisions and working rules that are easy to forget.

## Working agreement

- Work in this repo, on the `aux-prototype` branch. `main` only has the initial commit. Commit and push when a piece of work is done; do not open a pull request unless asked.
- The owner is not an experienced developer. Explain things in plain language, and give exact click-by-click or copy-paste steps. They are on a Mac and run the app from VS Code with F5 (`.vscode/launch.json`). F5 must never modify tracked files (a rewritten `package-lock.json` blocks their pulls), so it installs with `npm ci`, and only when `package-lock.json` is newer than `node_modules`. They can't run git commands confidently: if a pull fails, give exact VS Code clicks.
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
- Connecting Spotify imports sample listens unless `VITE_SPOTIFY_CLIENT_ID` is set; it now is (in `.env.development`), so on the owner's computer "Connect Spotify" goes to Spotify's real sign-in. With it set, sign-in is real (PKCE, `src/services/spotify.ts`) and `importSpotify` pulls recent plays (Spotify only returns the last 50), top tracks and artists, and now playing. `applySpotifyImport` in `store.ts` adds unknown songs to the catalog (`catalogExtra`, ids `t-sp-…`/`al-sp-…`/`ar-sp-…`, re-registered on load), reuses catalog ids for songs already there (`findTrack` ignores case, "(feat. …)" and "- Remaster"), replaces the sample plays with real ones the first time, and merges later syncs without duplicates. Spotify's free-text genres map to Aux genres via `mapGenre` in `catalog.ts`. Sync runs on startup if older than 10 minutes and from "Sync now" in Settings (`src/services/spotifySync.ts`). Connection problems are never silent: `friendlySpotifyError` (`spotify.ts`) turns them into plain-language advice, kept in `useSpotifyStatus` and shown on Home, in onboarding and in Settings (with Try again). The most likely real-world one is Spotify's Development Mode 403 ("the user may not be registered"): the account must be in the Spotify app's User Management list. One endpoint failing no longer fails the whole import. This has been tested against simulated Spotify responses only, not a live Spotify app.
- Replies in Messages are simulated: after you send someone a song, there is a 70% chance they send one back 3–7 seconds later (`simulateReply` in `store.ts`). Remove this when a real backend exists.
- Admin mode is a Settings toggle, on by default, so the awards phases can be advanced in the demo.

## Backend (Supabase)

- **Real project:** "Aux", id/ref `rckefbbxufhsrtbdcvss` (org "UH60-BlackHawk's Org", us-east-1), managed through the **Supabase connector** (MCP tools: `apply_migration`, `execute_sql`, `deploy_edge_function`, `get_advisors`, `create_edge_function_secret`…). Migrations 0001–0004 are applied (0001/0002 by the owner in the SQL editor, 0003/0004 via the connector, so `list_migrations` only shows the last two). Both Edge Functions are deployed (`verify_jwt` off: `serve.ts` checks the user itself, which also works with Supabase's newer signing keys). This container's network can't reach `*.supabase.co`, so the app can't be exercised against the real project from here; use the connector to inspect it. Owner still has to do in the dashboard (no connector tool for these): Auth URL configuration, inviting their school email to the team or custom SMTP, and entering secrets when `create_edge_function_secret` prompts (the first prompt timed out unanswered). After the owner signs in, make them admin with `execute_sql`.
- **Supabase specifics found on the real project:** `service_role` had no table privileges until 0004 granted them (plain Postgres hides this); the security advisor flags SECURITY DEFINER functions callable via `/rest/v1/rpc`, so policy helpers live in the unexposed `private` schema (`can_see`, `can_message`, `is_following`, `is_blocked_between`) and trigger functions have no EXECUTE for users. New functions get default EXECUTE grants to `anon`/`authenticated` in Supabase: revoke what students shouldn't call, and re-run `get_advisors` after schema changes. Server functions accept `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEYS`.
- **Status:** schema, security rules and the app connection are built and tested locally, and deployed to the real project above; not yet exercised end to end by a real student sign-in. Migrations in `supabase/migrations/` run in order; `0002_catalog.sql` is generated by `node scripts/catalog-sql.mjs` from `src/data/catalog.ts` (regenerate it when sample songs change). Next: hosting the app online, and custom SMTP for sign-in emails.
- **Live mode** is on when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set (or `VITE_TEST_BRIDGE` for tests): `LIVE` in `src/services/mode.ts`. Sample mode is unchanged when they aren't.
- **How live mode works:** `src/services/remote.ts` is the only code that talks to the backend (a Supabase implementation and a test-bridge implementation behind one `Remote` interface). `src/services/live.ts` loads everything the student may see into the same Zustand store and writes changes back by **diffing** the store after each change (`opsFor`), so store actions and screens are the same in both modes. Add a new kind of data by mapping it in `loadAll()` and `opsFor()`. Inside the store the signed-in student is always `'me'`; `toRemote`/`toLocal` translate. Rows are saved update-then-insert (`save`), because students lack update rights on key columns.
- In live mode the store starts from `emptyLiveData()` (no sample classmates), browser storage keeps only `theme` and `onboarded` (key `aux-live-v1`), simulations are off (`simulateReply`, mock Spotify listens), and award phase changes and report resolution go through server functions (`liveHooks`). Charts and prediction points use server totals (`useRpc`), because students can't read each other's private activity. A refused write shows a plain-language banner and reloads so the screen matches the database.
- **Owner-approved approach to Spotify's 5-user limit:** Spotify sign-in stays an extra for the owner and up to four testers; everyone else gets search and links through the server (app-only Spotify credentials, `supabase/functions/spotify`), Last.fm for automatic history, and the embedded player for playback. Don't circumvent Spotify's limits (extra apps or accounts). Automatic history is opt-in, never required.
- **Server functions** (`supabase/functions/`, deployed with `npx supabase functions deploy <name>`): the logic is in `_shared/handlers.ts` and is runtime-agnostic (Deno on Supabase, Node in tests) with database access behind the `Db` interface (`_shared/supabaseDb.ts` in production, `supabase/tests/pgdb.mjs` in tests). `_shared/music.ts` duplicates `mapGenre`/`cleanTitle` from `src/data/catalog.ts`: change both. Secrets live only in Supabase (Edge Functions → Secrets): `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `LASTFM_API_KEY`, `LASTFM_SHARED_SECRET`.
- **Search and links:** in live mode every song `Picker` also searches Spotify through the server and recognises pasted links (`src/services/songSearch.ts`). Search doesn't save anything; picking a new song adds it via `addCatalog`, and the live diff inserts it into the shared catalog. New catalog ids: `t-sp-`/`al-sp-`/`ar-sp-` (Spotify), `t-lf-`/`al-lf-`/`ar-lf-` (Last.fm-only songs).
- **Last.fm:** the student signs in on Last.fm's site (`beginLastfmAuth`), which returns `?lastfm=1&token=…`; the server exchanges the token (signed request, `_shared/lastfm.ts`), stores the verified `lastfm_username` (students can't set it themselves) and imports plays. Always show the privacy note (`LastfmConnect`) before sending a student to Last.fm: Last.fm profiles are public by default. Sync runs on startup if older than 10 minutes, or from Settings.
- **Clip playback** (`useClip` in `src/components/ui.tsx`): Spotify Web Playback SDK if this student is signed in with Spotify; otherwise Spotify's embedded player (`src/components/SpotifyEmbed.tsx`, iFrame API), finding the song's Spotify id through the server's `resolve` action when needed; otherwise a visual preview and "Open in Spotify". The embed's `seek` is documented for podcasts and people report quirks with tracks, so every failure path falls back. Listeners not logged in to Spotify get Spotify's fixed 30-second preview (no seeking): the app says so. If the browser blocks autoplay, it asks the student to tap play in the player.
- **Sign-in:** Supabase emails a link and, if the email template includes `{{ .Token }}`, a 6–8 digit code; the app accepts either (`completeLinkSignIn`, `verifyCode`). Supabase's built-in email only reaches team members (~2/hour): fine for the owner testing, but custom SMTP is required before students sign up. Recommended to the owner (`docs/SETUP.md` Part E): a dedicated Gmail account with an app password (smtp.gmail.com:465), since they own no domain; the app password goes only into Supabase. The Magic Link and Confirm signup templates should include `{{ .Token }}`, because school mail scanners can consume sign-in links. Spotify's return also uses `?code=`; it's told apart by its `state` parameter.
- **Public config:** `.env.development` (demo: Spotify Client ID only; `npm run dev`, the "Run Aux" F5 option) and `.env.live` (Spotify Client ID + Supabase URL and publishable key; `npm run dev:live` = `vite --mode live`, the "Run Aux (live backend)" option). Both committed. Live mode stays opt-in until the owner has finished the dashboard steps; make it the default afterwards. The Spotify Client ID is there (`194dfd6ca1f440899ad72929dbf6ecbf`, received from the owner; redirect URI `http://127.0.0.1:5173/`). When the owner sends other public values (Supabase URL and publishable key, Last.fm API key), add them there and commit. Only public values go in that file. A private `.env`/`.env.local` overrides it and stays git-ignored. Production builds (hosting) will need an `.env.production` too.
- **Waiting on the owner** for: the Last.fm API key (public), and the dashboard steps above. Those are safe to receive in chat. Never ask for or accept the Supabase `service_role`/secret key, the database password or the Spotify client secret; the owner keeps those. Setup steps for the owner are in `docs/SETUP.md`; keep that file current when steps change.
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
- In live mode `me.spotifySync` is not saved to the database, so it's missing after every load: never assume it exists (`spotifySync!` crashed every first live connect, silently, until Nov 2026). Spotify's Development Mode refusals are plain text, not JSON, so `api()` reads the body as text first.
- Class names are global: check `base.css` before naming a new one. A new `.badge` class once collided with the award-badge chips and hid their labels; the unread counter is `.count-badge`.

## Verifying changes

**Live mode, end to end** (two students against a local Postgres with the real rules):

```bash
pg_ctlcluster 16 main start
```

```bash
DATABASE_URL=postgres://aux_test:aux_test@127.0.0.1:5432/aux_test node --experimental-strip-types supabase/tests/bridge.mjs --reset --functions
```

In another terminal:

```bash
VITE_TEST_BRIDGE=http://127.0.0.1:8787 VITE_LASTFM_API_KEY=test-lastfm-key npx vite build --outDir dist-bridge && npx vite preview --outDir dist-bridge --host 127.0.0.1 --port 4175
```

```bash
DATABASE_URL=postgres://aux_test:aux_test@127.0.0.1:5432/aux_test node supabase/tests/live-app.e2e.cjs
```

Then the player test, against the same bridge and build (it uses a stand-in for Spotify's embed script):

```bash
node supabase/tests/player.e2e.cjs
```

`npm run test:db` and `npm run test:functions` wipe and recreate the same database, so restart the bridge with `--reset` before re-running the browser tests. The `aux_test` database and role are created once with `psql` as the `postgres` user. Server functions alone: `DATABASE_URL=… npm run test:functions` (stand-in Spotify and Last.fm in `supabase/tests/fakes.mjs`; the Last.fm stand-in checks request signatures). The bridge stands in for Supabase (every request runs as the signed-in student with RLS on); it does not cover Supabase's own email delivery or Realtime, which only a real project can test.

**Sample mode:**

```bash
npm run build
```

That type-checks and builds. There are no automated tests. For UI changes, also run the app (`npm run dev`, or `npx vite preview` after a build) and click through the affected screens in a headless browser at phone size (390×844), checking for console errors, in the default theme and at least one dark theme.

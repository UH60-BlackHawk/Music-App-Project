# Aux — notes for Claude

Aux is a social music app prototype for students at Noble and Greenough School ("Nobles", Dedham MA). The name is from "passing the aux". Read `README.md` for the feature table, stack, data model and file layout; this file holds the decisions and working rules that are easy to forget.

## Working agreement

- Work in this repo, on the `aux-prototype` branch. `main` only has the initial commit. Commit and push when a piece of work is done; do not open a pull request unless asked.
- The owner is not an experienced developer. Explain things in plain language, and give exact click-by-click or copy-paste steps. They are on a Mac and run the app from VS Code with F5 (`.vscode/launch.json`).
- Keep `README.md` in step with the code whenever a feature is added or removed.

## Product decisions so far

- **Sign-in** is limited to `@nobles.edu` (`SCHOOL_DOMAIN` in `src/screens/Welcome.tsx`). No email is really sent; any 6 digits pass.
- **Spotify only.** Apple Music was removed on request. It may come back later, so keep provider logic easy to extend, but do not add Apple Music UI, links or copy until asked.
- **Listening Party was removed** on request. Do not re-add it.
- **Recommendations** are computed from in-app data only (`src/lib/recs.ts`), never Spotify's recommendations endpoint, and every suggestion shows a reason.
- **Best-part clips** store a track id and start second only. Never store or bundle audio.
- **Leaderboard** uses opted-in users only and shows aggregate counts, never who listened to what.
- **Privacy** goes through one function, `canSee` in `src/lib/select.ts`. Any new surface that shows a person's activity must use it. Follower / following lists are visible on every profile (blocked users hidden).
- **Naming**: the school's nickname is "Nobles", never "Noble". The awards are the "Nobles Music Awards" (NMAs). Only the full name "Noble and Greenough School" uses the singular.
- **NMAs**: results stay hidden until the reveal; one vote per student per category; winners get a Golden Bulldog shown on the item page and the nominator's profile.
- **Predictions** award free points only. No money or purchasable currency, ever.
- **No emoji reactions.** They were removed on request. Song of the Day and recommendation cards carry an inline star rating (`QuickRate`) instead; the full rating and review form stays on the song / album page.
- **No emoji characters anywhere in the UI.** Use the `Icon` component (`ICONS` in `src/components/ui.tsx`) so icons follow the theme's stroke style. Award categories and badges store an icon name, not an emoji. The ★ rating glyphs are the one exception.
- **Cover art is generated** (`Cover` in `src/components/ui.tsx`). Do not add real album artwork.
- **No school API is assumed.** `?embed=1` drops the phone frame for future embedding in the Nobles app.

## What is simulated

- Everything runs in the browser; state is a Zustand store persisted to `localStorage` under `aux-v2` (`src/store.ts`). There is no backend, so nothing is shared between devices. Suggested next step is Supabase.
- The other students, their listens, nominations, votes and prediction picks are seeded (`src/data/seed.ts`).
- Connecting Spotify imports sample listens unless `VITE_SPOTIFY_CLIENT_ID` is set. The real adapter (`src/services/spotify.ts`) has not been tested against a live Spotify app, and its data only appears under "Live from your Spotify" in Settings; it does not yet feed profiles, charts or recommendations.
- Admin mode is a Settings toggle, on by default, so the awards phases can be advanced in the demo.

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
- Do not change the shape of persisted state casually: existing browsers keep old data. Removing fields is safe; for renamed or required new fields, bump the storage key or tell the owner to use "Reset demo data".

## Verifying changes

```bash
npm run build
```

That type-checks and builds. There are no automated tests. For UI changes, also run the app (`npm run dev`, or `npx vite preview` after a build) and click through the affected screens in a headless browser at phone size (390×844), checking for console errors, in the default theme and at least one dark theme.

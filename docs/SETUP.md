# Setting up Spotify and the backend

Three free accounts power the real version of Aux:

- **Supabase** is the backend: a database and sign-in service, so classmates share one app instead of each having their own copy in their browser. Start here.
- **Spotify for Developers** powers searching all of Spotify for everyone, and Spotify sign-in for you and up to four testers.
- **Last.fm** gives everyone else automatic listening history: each student links their Spotify to Last.fm once.

Each part takes about 10 minutes. Parts A and B can be done in either order; Part D needs A, B and C done.

---

## Part A: Spotify

**Know the limits first.** As of Spotify's July 2026 developer update, a new Spotify app is in "Development Mode": **only 5 people can sign in with it**, you add them by hand, and **the app owner needs Spotify Premium**. Spotify only lifts that limit for established businesses with large audiences, so for now Spotify sign-in is for you and up to four testers. Everyone else will use Aux without connecting Spotify. Spotify's dashboard shows the current limits when you create the app.

1. Go to <https://developer.spotify.com/dashboard> and log in with your Spotify account.
2. Click **Create app** and fill in:
   - **App name:** Aux
   - **App description:** A music-sharing app for Nobles students
   - **Redirect URI:** `http://127.0.0.1:5173/` (type it exactly, then click **Add**)
   - **Which API/SDKs are you planning to use?** tick **Web API** and **Web Playback SDK**
3. Tick the terms box and click **Save**.
4. On your app's page, click **Settings**. Copy the **Client ID** (a long string of letters and numbers). Then click **View client secret** and copy that too, but keep it private: it only ever goes into Supabase in Part D, never into the app or our chat.
5. Click **User Management** and add yourself, plus up to four friends who want to test (their name and the email on their Spotify account).
6. Put the Client ID into the app. **Done:** it's in `.env.development` in the project (public settings the app reads when you press F5). Pull the latest code, then restart the app: press **Shift+F5**, then **F5**.
7. The app now opens at `http://127.0.0.1:5173/`. Your old demo was saved under `localhost`, so you'll sign in once more with the demo student. Then go to **Settings → Connected account → Connect** and log in to Spotify.

Public values like the Client ID can go in our chat, and I'll add them to `.env.development` for you. Never share the client secret: it goes only into Supabase (Part D).

---

## Part B: Supabase (the backend)

> **Status (done for you through the Supabase connector):** the project "Aux" exists; all four database files are applied (tables, security rules, sample songs, award season, predictions ballot, and the security hardening); the app's connection details are in `.env.live`; the two server functions are deployed. **What's left for you:** steps 5 and 6 below, the secret keys in Part D step 3, then sign in (step 8) using **Run Aux (live backend)** and tell me, and I'll make you the admin.

1. Go to <https://supabase.com>, click **Start your project**, and sign in with GitHub.
2. Click **New project**:
   - **Name:** aux
   - **Database password:** click **Generate a password** and save it in a password manager. Don't send it to anyone, including me.
   - **Region:** East US (closest to Dedham)
   - Click **Create new project** and wait a minute or two while it sets up.
3. Create the database. There are three files to run, **in order**, each in its own query:
   1. In the left sidebar, click **SQL Editor**, then **New query**.
   2. Open `supabase/migrations/0001_init.sql` from this project in VS Code, select everything (Cmd+A), copy it (Cmd+C), and paste it into the Supabase query box.
   3. Click **Run**. You should see "Success. No rows returned".
   4. Repeat with `0002_catalog.sql` (the sample songs) and then `0003_live.sql` (Last.fm support, charts and the starting award season).
4. Get the two connection details:
   1. Click **Project Settings** (the gear at the bottom of the sidebar), then **API Keys** (on some layouts it's under **Data API** or **API**).
   2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
   3. Copy the **publishable** key (older projects call it the **anon public** key).
5. Tell Supabase where the app lives, so sign-in links come back to it:
   1. In the sidebar, click **Authentication**, then **URL Configuration**.
   2. Set **Site URL** to `http://127.0.0.1:5173/`.
   3. Under **Redirect URLs**, click **Add URL** and add `http://127.0.0.1:5173/`. Save.
6. Let your school email receive sign-in emails while testing. Supabase's built-in email only sends to members of your Supabase team, about 2 emails an hour:
   1. Click your organization name at the top left, then **Team**, then **Invite**.
   2. Invite your `@nobles.edu` address and accept the invite from that inbox.
   Before inviting other students, do **Part E** (sending sign-in emails to everyone).
7. Put the two values into the app: send them to me in our chat and I'll add them to `.env.development` (or add the lines `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_ANON_KEY=…` to that file yourself). Pull, then restart the app (**Shift+F5**, then **F5**). The app now shows a real sign-in screen.
8. In VS Code's **Run and Debug** panel (the play button with a bug, left sidebar), choose **Run Aux (live backend)** from the dropdown at the top, then press **F5**. (**Run Aux** stays the demo with sample data.) Sign in with your `@nobles.edu` email: tap the link in the email (on the same computer), or type the code if the email shows one.
9. Make yourself the admin. Back in Supabase, open **SQL Editor → New query**, paste this with your email filled in, and click **Run**:

   ```sql
   update profiles set is_admin = true where email = 'your.name@nobles.edu';
   ```

   Reload the app and the admin dashboard appears in Settings.
10. You can also send me the Project URL and the publishable key in our chat. Both are safe to share: they're designed to be public and ship inside the app, and the database's security rules protect the data. **Never share the `service_role` / secret key or the database password.**

Free Supabase projects pause after a week with no activity. If that happens, open the project in the dashboard and click **Restore**.

---

## Part C: Last.fm

1. Make a free Last.fm account at <https://www.last.fm/join> if you don't have one. (To test it yourself, also open Last.fm's **Settings → Applications** and connect your Spotify, so your plays appear there.)
2. Go to <https://www.last.fm/api/account/create> and fill in:
   - **Contact email:** your email
   - **Application name:** Aux
   - **Application description:** A music-sharing app for Nobles students
   - **Callback URL:** `http://127.0.0.1:5173/`
   - Leave the homepage blank. Click **Submit**.
3. Last.fm shows an **API key** and a **Shared secret**. Copy both.
   - The **API key** is public: send it to me in our chat and I'll add it to `.env.development` as `VITE_LASTFM_API_KEY`.
   - The **Shared secret** is private: it goes only into Supabase in Part D.
4. Save `.env` and restart the app (**Shift+F5**, then **F5**).

---

## Part D: Turn on search and Last.fm (the server functions)

> **Status:** both functions are already deployed for you, so skip steps 1 and 2. You only need step 3 (the secret keys). When I trigger it, Supabase asks you for each value in its dashboard, so the values never pass through our chat.

Searching all of Spotify and importing Last.fm plays run on Supabase, where the secret keys stay safe. This part uses VS Code's terminal once.

1. In VS Code, open the terminal: **Terminal → New Terminal**.
2. Run each of these lines, pressing Enter after each:

   ```bash
   npx supabase login
   ```

   (A browser window opens: approve it, then come back.)

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   Your project ref is the part of your Project URL before `.supabase.co`: for `https://abcdefgh.supabase.co`, it's `abcdefgh`. If it asks for the database password, paste it from your password manager.

   ```bash
   npx supabase functions deploy spotify
   ```

   ```bash
   npx supabase functions deploy lastfm
   ```

3. Add the secret keys in the Supabase dashboard: **Edge Functions → Secrets** (in some layouts, **Project Settings → Edge Functions**). Add these four, one at a time, with **Name** exactly as written:
   - `SPOTIFY_CLIENT_ID`: your Spotify Client ID
   - `SPOTIFY_CLIENT_SECRET`: your Spotify client secret
   - `LASTFM_API_KEY`: your Last.fm API key
   - `LASTFM_SHARED_SECRET`: your Last.fm shared secret
4. In the app, any song picker now shows **On Spotify** results under the usual list, and you can paste a Spotify song link into it. **Settings → Connected accounts → Last.fm → Connect** links Last.fm.

If you ever change code in `supabase/functions/`, run the two `deploy` lines again.

---

## Part E: Sending sign-in emails to everyone (custom SMTP)

Supabase's built-in email only reaches your Supabase team, about 2 emails an hour. To email every student, Supabase sends through a mailbox you provide ("SMTP"). The simplest free option without owning a website domain is a Gmail account just for Aux.

**1. Make a Gmail account for Aux** (about 5 minutes)

1. Go to <https://accounts.google.com/signup> and create an account, for example `aux.nobles.app@gmail.com` (any free name works). Students will see this address on their sign-in emails.
2. Turn on 2-Step Verification: <https://myaccount.google.com/security> → **2-Step Verification** → follow the steps. App passwords only exist once this is on.

**2. Create an app password** (a separate password just for Supabase)

1. Signed in as the Aux Gmail account, go to <https://myaccount.google.com/apppasswords>.
2. **App name:** Supabase. Click **Create**.
3. Google shows a 16-letter password once. Copy it (ignore the spaces). It's a secret: it goes only into Supabase in the next step, never into the app or our chat. If you lose it, delete it on that page and make a new one.

**3. Put it into Supabase**

1. In your Supabase project: **Authentication** → **Emails** → **SMTP Settings** (on some layouts: **Project Settings → Authentication → SMTP Settings**).
2. Turn on **Enable Custom SMTP** and fill in:
   - **Sender email:** your Aux Gmail address
   - **Sender name:** Aux
   - **Host:** `smtp.gmail.com`
   - **Port number:** `465`
   - **Minimum interval between emails:** leave the default
   - **Username:** your Aux Gmail address again
   - **Password:** the 16-letter app password (no spaces)
3. Click **Save**.
4. Raise the email limit: **Authentication** → **Rate Limits** → set **Rate limit for sending emails** to about `100` per hour → **Save**.

**4. Put the code in the email**

Some school email systems scan links in incoming mail and "click" them before you do, which uses up the sign-in link. A code avoids that, and Aux accepts either.

1. **Authentication** → **Emails** → **Templates**.
2. Open **Magic Link**. Set **Subject** to `Your Aux sign-in code` and replace the message body with:

   ```html
   <h2>Sign in to Aux</h2>
   <p>Your code is <strong style="font-size: 22px; letter-spacing: 3px;">{{ .Token }}</strong></p>
   <p>Or open this link on the same device: <a href="{{ .ConfirmationURL }}">Sign in to Aux</a></p>
   <p>If you didn't ask to sign in, you can ignore this email.</p>
   ```

3. Click **Save**. Then open **Confirm signup** (used the first time someone signs in), paste the same body with the subject `Welcome to Aux: your sign-in code`, and **Save**.

**5. Test it**

Sign in to Aux with your `@nobles.edu` address. The email should come from your Aux Gmail within a minute. If it isn't there, check spam or quarantine; if the school's filter holds it, ask the technology office to allow the Aux Gmail address. Then ask a friend to try theirs.

When Aux grows, a more official option is to buy a domain (about $10 a year) and use a sending service like Resend, or to ask the school for an address. The steps above are the same, just with that service's details.

---

## Before real students use it

Nobles includes students under 18, and some under 13. Before inviting classmates beyond a few testers, check with the school (for example, the technology office) that they're comfortable with a student-run app storing school email addresses and listening history. The backend is built to be careful (school emails only, privacy settings and blocking enforced by the database), but the school should know about it.

---

## For developers: testing

The security rules have an automated test suite that runs against a local Postgres:

```bash
DATABASE_URL=postgres://user:password@127.0.0.1:5432/aux_test npm run test:db
```

It wipes and rebuilds the schema in that database each run, so point it at an empty test database only.

The whole app can also be tested against that local database, with two pretend students, through a stand-in for Supabase (the "test bridge"). The steps are in CLAUDE.md under "Verifying changes".

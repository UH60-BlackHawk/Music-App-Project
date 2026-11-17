# Setting up Spotify and the backend

Two free accounts power the real version of Aux:

- **Spotify for Developers** lets people sign in with Spotify so Aux can read what they listen to.
- **Supabase** is the backend: a database and sign-in service, so classmates share one app instead of each having their own copy in their browser.

Each part takes about 10 minutes. You can do them in either order.

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
4. On your app's page, click **Settings**. Copy the **Client ID** (a long string of letters and numbers). Don't click "View client secret"; Aux doesn't need it.
5. Click **User Management** and add yourself, plus up to four friends who want to test (their name and the email on their Spotify account).
6. Put the Client ID into the app:
   1. In VS Code's file list, right-click `.env.example`, choose **Copy**, then right-click the empty space and choose **Paste**. Rename the copy to exactly `.env`.
   2. Open `.env` and paste the Client ID after `VITE_SPOTIFY_CLIENT_ID=` (no spaces, no quotes). Save.
   3. Restart the app: press **Shift+F5**, then **F5**.
7. The app now opens at `http://127.0.0.1:5173/`. Your old demo was saved under `localhost`, so you'll sign in once more with the demo student. Then go to **Settings → Connected account → Connect** and log in to Spotify.

You can paste the Client ID into our chat too. It isn't a secret, since it's built into the app anyway. Never share the client secret.

---

## Part B: Supabase (the backend)

1. Go to <https://supabase.com>, click **Start your project**, and sign in with GitHub.
2. Click **New project**:
   - **Name:** aux
   - **Database password:** click **Generate a password** and save it in a password manager. Don't send it to anyone, including me.
   - **Region:** East US (closest to Dedham)
   - Click **Create new project** and wait a minute or two while it sets up.
3. Create the database:
   1. In the left sidebar, click **SQL Editor**, then **New query**.
   2. Open `supabase/migrations/0001_init.sql` from this project in VS Code, select everything (Cmd+A), copy it (Cmd+C), and paste it into the Supabase query box.
   3. Click **Run**. You should see "Success. No rows returned".
4. Get the two connection details:
   1. Click **Project Settings** (the gear at the bottom of the sidebar), then **API Keys** (on some layouts it's under **Data API** or **API**).
   2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
   3. Copy the **publishable** key (older projects call it the **anon public** key).
5. Send me the Project URL and the publishable key in our chat. Both are safe to share: they're designed to be public and ship inside the app, and the database's security rules protect the data. **Never share the `service_role` / secret key or the database password.**

Free Supabase projects pause after a week with no activity. If that happens, open the project in the dashboard and click **Restore**.

---

## Before real students use it

Nobles includes students under 18, and some under 13. Before inviting classmates beyond a few testers, check with the school (for example, the technology office) that they're comfortable with a student-run app storing school email addresses and listening history. The backend is built to be careful (school emails only, privacy settings and blocking enforced by the database), but the school should know about it.

---

## For developers: testing the database rules

The security rules have an automated test suite that runs against a local Postgres:

```bash
DATABASE_URL=postgres://user:password@127.0.0.1:5432/aux_test npm run test:db
```

It wipes and rebuilds the schema in that database each run, so point it at an empty test database only.

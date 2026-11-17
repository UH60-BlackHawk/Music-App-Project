-- Aux database schema for Supabase (Postgres).
--
-- Every product rule that matters for safety or fairness is enforced here with Row Level Security,
-- so it holds even if someone bypasses the app: school-email-only sign-up, the privacy setting,
-- blocking, who may message whom, sealed NMA votes, prediction lock times, and admin-only moderation.
--
-- Apply it in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
-- Tested against plain Postgres 16 with a stand-in for Supabase's auth schema (see supabase/tests).

-- ============================================================================
-- Settings
-- ============================================================================
create table public.app_settings (
  key text primary key,
  value text not null
);
insert into public.app_settings (key, value) values ('school_domain', 'nobles.edu');

-- ============================================================================
-- Profiles (one per signed-in student, created automatically on sign-up)
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '' check (char_length(name) <= 60),
  handle text not null unique check (handle ~ '^[a-z0-9._-]{1,40}$'),
  class_year int check (class_year between 2020 and 2040),
  color text not null default '#0b3b8c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  bio text not null default '' check (char_length(bio) <= 160),
  -- Small square JPEG data URL from the in-app cropper (~10 KB). Move to Supabase Storage later.
  photo text check (photo is null or (photo like 'data:image/%' and char_length(photo) < 60000)),
  privacy text not null default 'school' check (privacy in ('school', 'friends', 'private')),
  sharing_paused boolean not null default false,
  leaderboard_opt_in boolean not null default true,
  genres text[] not null default '{}',
  favorite_albums text[] not null default '{}',
  badges text[] not null default '{}',          -- awarded by the server only
  now_playing text,
  spotify_connected boolean not null default false,
  is_admin boolean not null default false,       -- set by an existing admin only
  created_at timestamptz not null default now()
);

-- Only @school-domain addresses may sign up or switch to a new address.
create function public.enforce_school_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  domain text := (select value from public.app_settings where key = 'school_domain');
begin
  if new.email is null or lower(split_part(new.email, '@', 2)) <> domain then
    raise exception 'Aux is only for @% email addresses', domain using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger enforce_school_email_on_signup
  before insert on auth.users for each row execute function public.enforce_school_email();
create trigger enforce_school_email_on_change
  before update of email on auth.users for each row execute function public.enforce_school_email();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := regexp_replace(split_part(lower(new.email), '@', 1), '[^a-z0-9._-]', '', 'g');
  candidate text := base;
  n int := 1;
begin
  while exists (select 1 from public.profiles where handle = candidate) loop
    n := n + 1;
    candidate := base || n;
  end loop;
  insert into public.profiles (id, email, handle) values (new.id, lower(new.email), candidate);
  return new;
end $$;

create trigger create_profile_on_signup
  after insert on auth.users for each row execute function public.handle_new_user();

-- Students can edit their own profile, but never their admin flag, badges or email.
-- Changes made directly in the database (SQL editor, server code: no signed-in user) are trusted,
-- which is how the owner makes the first admin.
create function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.badges := old.badges;
  end if;
  if auth.uid() is not null then
    new.email := old.email;
    new.id := old.id;
  end if;
  return new;
end $$;

-- ============================================================================
-- Social graph
-- ============================================================================
create table public.follows (
  follower uuid not null references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

create table public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- Blocking removes follows in both directions.
create function public.unfollow_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows
   where (follower = new.blocker and followee = new.blocked)
      or (follower = new.blocked and followee = new.blocker);
  return new;
end $$;
create trigger unfollow_on_block after insert on public.blocks
  for each row execute function public.unfollow_on_block();

-- ============================================================================
-- Helper functions used by the security rules
-- ============================================================================
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks
                  where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

create function public.is_following(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows where follower = a and followee = b)
$$;

-- Mirrors canSee() in src/lib/select.ts: can `viewer` see `owner`'s listening activity?
create function public.can_see(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when viewer = owner then true
    when public.is_blocked_between(viewer, owner) then false
    else coalesce((
      select not p.sharing_paused and (
               p.privacy = 'school'
               or (p.privacy = 'friends' and public.is_following(viewer, owner) and public.is_following(owner, viewer)))
        from public.profiles p where p.id = owner), false)
  end
$$;

-- ============================================================================
-- Shared song catalog (sample songs plus anything imported from Spotify)
-- ============================================================================
create table public.artists (
  id text primary key,
  name text not null,
  genre text not null,
  spotify_id text unique
);
create table public.albums (
  id text primary key,
  title text not null,
  artist_id text not null references public.artists (id),
  year int,
  spotify_id text unique
);
create table public.tracks (
  id text primary key,
  title text not null,
  artist_id text not null references public.artists (id),
  album_id text not null references public.albums (id),
  duration_s int not null check (duration_s > 0),
  spotify_id text unique
);

-- ============================================================================
-- Listening, ratings, comments
-- ============================================================================
create table public.listens (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  track_id text not null references public.tracks (id),
  played_at timestamptz not null,
  unique (user_id, track_id, played_at)
);
create index listens_played_at on public.listens (played_at desc);

create table public.ratings (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_type text not null check (item_type in ('track', 'album')),
  item_id text not null,
  stars numeric(2, 1) not null check (stars between 0.5 and 5 and stars * 2 = floor(stars * 2)),
  review text not null default '' check (char_length(review) <= 240),
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_id text not null,
  text text not null check (char_length(text) between 1 and 240),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Songs sent: feed posts (to_id is null) and direct messages (to_id set). Songs only.
-- clip_start is the 30-second "best part" in seconds, or null. Audio is never stored.
-- ============================================================================
create table public.songs_sent (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id uuid references public.profiles (id) on delete cascade,
  track_id text not null references public.tracks (id),
  clip_start int check (clip_start >= 0),
  note text not null default '' check (char_length(note) <= 140),
  read boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index songs_sent_to on public.songs_sent (to_id, created_at desc);
create index songs_sent_from on public.songs_sent (from_id, created_at desc);

-- Mirrors shareContacts(): you may send songs to people you follow, or anyone who has sent you one.
create function public.can_message(sender uuid, recipient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sender <> recipient
     and not public.is_blocked_between(sender, recipient)
     and (public.is_following(sender, recipient)
          or exists (select 1 from public.songs_sent where from_id = recipient and to_id = sender))
$$;


-- ============================================================================
-- Reports and moderation
-- ============================================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('comment', 'review', 'user', 'rec')),
  target_id text not null,
  reason text not null check (char_length(reason) <= 120),
  status text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Song / Album of the Day (a single settings row)
-- ============================================================================
create table public.daily_config (
  id boolean primary key default true check (id),
  mode text not null default 'manual' check (mode in ('manual', 'auto')),
  metric text not null default 'shared' check (metric in ('shared', 'rated')),
  track_id text references public.tracks (id),
  album_id text references public.albums (id)
);
insert into public.daily_config (id) values (true);

-- ============================================================================
-- Nobles Music Awards
-- ============================================================================
create table public.nma_seasons (
  id text primary key,                    -- e.g. 'fall-2026'
  name text not null,                     -- e.g. 'Fall 2026'
  phase text not null default 'nominations' check (phase in ('nominations', 'voting', 'reveal')),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.nma_categories (
  season_id text not null references public.nma_seasons (id) on delete cascade,
  id text not null,
  name text not null,
  item_type text not null check (item_type in ('track', 'album')),
  icon text not null default 'sparkle',
  active boolean not null default true,
  primary key (season_id, id)
);
create table public.nma_nominations (
  season_id text not null,
  category_id text not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_id text not null,
  created_at timestamptz not null default now(),
  primary key (season_id, category_id, user_id),          -- one nomination per category per student
  foreign key (season_id, category_id) references public.nma_categories (season_id, id) on delete cascade
);
create table public.nma_votes (
  season_id text not null,
  category_id text not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_id text not null,
  created_at timestamptz not null default now(),
  primary key (season_id, category_id, user_id),          -- one vote per category per student
  foreign key (season_id, category_id) references public.nma_categories (season_id, id) on delete cascade
);
create table public.nma_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 60),
  status text not null default 'open' check (status in ('open', 'approved', 'declined')),
  created_at timestamptz not null default now()
);
create table public.nma_winners (
  season_id text not null references public.nma_seasons (id) on delete cascade,
  category_id text not null,
  category_name text not null,
  item_type text not null,
  item_id text not null,
  nominator_id uuid references public.profiles (id) on delete set null,
  primary key (season_id, category_id)
);

-- The ballot: the four most-nominated items in a category (earliest nomination breaks ties).
create function public.nma_ballot(p_season text, p_category text) returns table (item_id text, nominations bigint)
language sql stable security definer set search_path = public as $$
  select n.item_id, count(*) from public.nma_nominations n
   where n.season_id = p_season and n.category_id = p_category
   group by n.item_id
   order by count(*) desc, min(n.created_at)
   limit 4
$$;

-- Vote totals, available to everyone only once the season is in the reveal phase.
create function public.nma_results(p_season text) returns table (category_id text, item_id text, votes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if (select phase from public.nma_seasons where id = p_season) is distinct from 'reveal' then
    raise exception 'Results are sealed until the reveal' using errcode = 'P0001';
  end if;
  return query select v.category_id, v.item_id, count(*) from public.nma_votes v
                where v.season_id = p_season group by v.category_id, v.item_id;
end $$;

-- Admin only: move a season to a phase. Entering 'reveal' tallies votes, records winners
-- (credited to the earliest student nominator) and awards the "Called It" badge.
create function public.nma_set_phase(p_season text, p_phase text) returns void
language plpgsql security definer set search_path = public as $$
declare c record; w record;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.nma_seasons set phase = p_phase where id = p_season;
  if p_phase <> 'reveal' then
    delete from public.nma_winners where season_id = p_season;
    return;
  end if;
  for c in select * from public.nma_categories where season_id = p_season and active loop
    select v.item_id into w from public.nma_votes v
     where v.season_id = p_season and v.category_id = c.id
     group by v.item_id order by count(*) desc, v.item_id limit 1;
    continue when not found;
    insert into public.nma_winners (season_id, category_id, category_name, item_type, item_id, nominator_id)
    values (p_season, c.id, c.name, c.item_type, w.item_id,
            (select n.user_id from public.nma_nominations n
              where n.season_id = p_season and n.category_id = c.id and n.item_id = w.item_id
              order by n.created_at limit 1))
    on conflict (season_id, category_id) do update set item_id = excluded.item_id, nominator_id = excluded.nominator_id;
    update public.profiles p set badges = array_append(p.badges, 'Called It')
     where not ('Called It' = any (p.badges))
       and p.id in (select n.user_id from public.nma_nominations n
                     where n.season_id = p_season and n.category_id = c.id and n.item_id = w.item_id);
  end loop;
end $$;

-- ============================================================================
-- Award predictions (free points only; no money or purchasable currency)
-- ============================================================================
create table public.pred_events (
  id text primary key,
  name text not null,
  note text not null default '',
  starts_at timestamptz not null,
  locked boolean not null default false
);
create table public.pred_categories (
  event_id text not null references public.pred_events (id) on delete cascade,
  id text not null,
  name text not null,
  nominees text[] not null default '{}',
  winner text,
  primary key (event_id, id)
);
create table public.pred_picks (
  event_id text not null,
  category_id text not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  nominee text not null,
  primary key (event_id, category_id, user_id),
  foreign key (event_id, category_id) references public.pred_categories (event_id, id) on delete cascade
);

create function public.pred_open(p_event text, p_category text, p_nominee text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pred_events e join public.pred_categories c on c.event_id = e.id
                  where e.id = p_event and c.id = p_category
                    and not e.locked and now() < e.starts_at and p_nominee = any (c.nominees))
$$;

-- 10 points per correct pick, for every student who made a pick.
create function public.prediction_leaderboard() returns table (user_id uuid, points bigint)
language sql stable security definer set search_path = public as $$
  select p.user_id, 10 * count(*) filter (where c.winner = p.nominee)
    from public.pred_picks p join public.pred_categories c on c.event_id = p.event_id and c.id = p.category_id
   group by p.user_id order by 2 desc
$$;

-- ============================================================================
-- Aggregates that read across students but never reveal who listened to what
-- ============================================================================
-- Nobles Leaderboard: totals from opted-in students only.
create function public.leaderboard(p_kind text, p_since timestamptz, p_genre text default null)
returns table (id text, plays bigint)
language sql stable security definer set search_path = public as $$
  select case p_kind when 'songs' then t.id when 'artists' then t.artist_id else t.album_id end, count(*)
    from public.listens l
    join public.profiles p on p.id = l.user_id and p.leaderboard_opt_in
    join public.tracks t on t.id = l.track_id
    join public.artists a on a.id = t.artist_id
   where l.played_at >= p_since and (p_genre is null or a.genre = p_genre)
   group by 1 order by 2 desc limit 20
$$;

-- Nobles average rating for a song or album (all non-hidden ratings).
create function public.item_rating(p_type text, p_id text) returns table (avg numeric, count bigint)
language sql stable security definer set search_path = public as $$
  select round(avg(stars), 2), count(*) from public.ratings
   where item_type = p_type and item_id = p_id and not hidden
$$;

-- ============================================================================
-- Moderation actions (admin only)
-- ============================================================================
create function public.resolve_report(p_report uuid, p_remove boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.reports set status = case when p_remove then 'removed' else 'dismissed' end
   where id = p_report returning * into r;
  if r is null or not p_remove then return; end if;
  if r.kind = 'comment' then update public.comments set hidden = true where id::text = r.target_id;
  elsif r.kind = 'rec' then update public.songs_sent set hidden = true where id::text = r.target_id;
  elsif r.kind = 'review' then
    -- review target ids are "<user_id>:<item_type>:<item_id>"
    update public.ratings set hidden = true
     where user_id::text = split_part(r.target_id, ':', 1)
       and item_type = split_part(r.target_id, ':', 2)
       and item_id = substr(r.target_id, length(split_part(r.target_id, ':', 1)) + length(split_part(r.target_id, ':', 2)) + 3);
  elsif r.kind = 'user' then update public.profiles set photo = null where id::text = r.target_id;
  end if;
end $$;

create function public.mark_thread_read(p_other uuid) returns void
language sql security definer set search_path = public as $$
  update public.songs_sent set read = true where to_id = auth.uid() and from_id = p_other and not read
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.artists enable row level security;
alter table public.albums enable row level security;
alter table public.tracks enable row level security;
alter table public.listens enable row level security;
alter table public.ratings enable row level security;
alter table public.comments enable row level security;
alter table public.songs_sent enable row level security;
alter table public.reports enable row level security;
alter table public.daily_config enable row level security;
alter table public.nma_seasons enable row level security;
alter table public.nma_categories enable row level security;
alter table public.nma_nominations enable row level security;
alter table public.nma_votes enable row level security;
alter table public.nma_proposals enable row level security;
alter table public.nma_winners enable row level security;
alter table public.pred_events enable row level security;
alter table public.pred_categories enable row level security;
alter table public.pred_picks enable row level security;

create policy "settings readable" on public.app_settings for select to authenticated using (true);

-- Profiles: the directory is visible to signed-in students (activity is guarded separately by can_see).
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create trigger protect_profile_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

create policy "follow lists readable" on public.follows for select to authenticated using (true);
create policy "follow others" on public.follows for insert to authenticated
  with check (follower = auth.uid() and not public.is_blocked_between(follower, followee));
create policy "unfollow" on public.follows for delete to authenticated using (follower = auth.uid());

create policy "see own blocks" on public.blocks for select to authenticated using (blocker = auth.uid());
create policy "block" on public.blocks for insert to authenticated with check (blocker = auth.uid());
create policy "unblock" on public.blocks for delete to authenticated using (blocker = auth.uid());

create policy "catalog readable" on public.artists for select to authenticated using (true);
create policy "catalog readable" on public.albums for select to authenticated using (true);
create policy "catalog readable" on public.tracks for select to authenticated using (true);
create policy "add to catalog" on public.artists for insert to authenticated with check (true);
create policy "add to catalog" on public.albums for insert to authenticated with check (true);
create policy "add to catalog" on public.tracks for insert to authenticated with check (true);
create policy "admin fixes catalog" on public.artists for update to authenticated using (public.is_admin());
create policy "admin fixes catalog" on public.tracks for update to authenticated using (public.is_admin());

create policy "listens follow privacy" on public.listens for select to authenticated
  using (public.can_see(auth.uid(), user_id));
create policy "log own listens" on public.listens for insert to authenticated with check (user_id = auth.uid());
create policy "delete own listens" on public.listens for delete to authenticated using (user_id = auth.uid());

create policy "ratings follow privacy" on public.ratings for select to authenticated
  using (user_id = auth.uid() or (not hidden and public.can_see(auth.uid(), user_id)));
create policy "rate" on public.ratings for insert to authenticated with check (user_id = auth.uid() and not hidden);
create policy "edit own rating" on public.ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own rating" on public.ratings for delete to authenticated using (user_id = auth.uid());

create policy "comments readable" on public.comments for select to authenticated
  using (user_id = auth.uid() or (not hidden and not public.is_blocked_between(auth.uid(), user_id)));
create policy "comment" on public.comments for insert to authenticated with check (user_id = auth.uid() and not hidden);
create policy "delete own comment" on public.comments for delete to authenticated using (user_id = auth.uid());

-- Direct messages are visible only to their two people; feed posts follow the sender's privacy.
create policy "songs sent visibility" on public.songs_sent for select to authenticated using (
  public.is_admin()
  or (not hidden and (from_id = auth.uid()
                      or to_id = auth.uid()
                      or (to_id is null and public.can_see(auth.uid(), from_id)))));
create policy "send songs" on public.songs_sent for insert to authenticated with check (
  from_id = auth.uid() and not hidden and not read
  and (to_id is null or public.can_message(auth.uid(), to_id)));
create policy "delete own sent song" on public.songs_sent for delete to authenticated using (from_id = auth.uid());

create policy "file reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
create policy "see own reports" on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());

create policy "daily readable" on public.daily_config for select to authenticated using (true);
create policy "admin sets daily" on public.daily_config for update to authenticated using (public.is_admin());

create policy "seasons readable" on public.nma_seasons for select to authenticated using (true);
create policy "admin manages seasons" on public.nma_seasons for insert to authenticated with check (public.is_admin());
create policy "categories readable" on public.nma_categories for select to authenticated using (true);
create policy "admin manages categories" on public.nma_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "nominations readable" on public.nma_nominations for select to authenticated using (true);
create policy "nominate while open" on public.nma_nominations for insert to authenticated with check (
  user_id = auth.uid()
  and (select phase from public.nma_seasons s where s.id = season_id) = 'nominations');
create policy "change nomination while open" on public.nma_nominations for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (select phase from public.nma_seasons s where s.id = season_id) = 'nominations');

-- Votes are sealed: you can only ever read your own; totals come from nma_results() after the reveal.
create policy "see own votes" on public.nma_votes for select to authenticated using (user_id = auth.uid());
create policy "vote while open" on public.nma_votes for insert to authenticated with check (
  user_id = auth.uid()
  and (select phase from public.nma_seasons s where s.id = season_id) = 'voting'
  and item_id in (select b.item_id from public.nma_ballot(season_id, category_id) b));
create policy "change vote while open" on public.nma_votes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and (select phase from public.nma_seasons s where s.id = season_id) = 'voting'
              and item_id in (select b.item_id from public.nma_ballot(season_id, category_id) b));

create policy "proposals readable" on public.nma_proposals for select to authenticated using (true);
create policy "propose" on public.nma_proposals for insert to authenticated with check (user_id = auth.uid() and status = 'open');
create policy "admin decides proposals" on public.nma_proposals for update to authenticated using (public.is_admin());

create policy "winners readable" on public.nma_winners for select to authenticated using (true);

create policy "events readable" on public.pred_events for select to authenticated using (true);
create policy "admin manages events" on public.pred_events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "pred categories readable" on public.pred_categories for select to authenticated using (true);
create policy "admin manages pred categories" on public.pred_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "see own picks" on public.pred_picks for select to authenticated using (user_id = auth.uid());
create policy "pick before lock" on public.pred_picks for insert to authenticated
  with check (user_id = auth.uid() and public.pred_open(event_id, category_id, nominee));
create policy "change pick before lock" on public.pred_picks for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.pred_open(event_id, category_id, nominee));

-- ============================================================================
-- Privileges: nothing for signed-out visitors; signed-in students get exactly what the policies allow.
-- Column-level grants stop students editing moderation flags and other server-owned fields.
-- ============================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;

grant select on all tables in schema public to authenticated;
grant insert, delete on public.follows, public.blocks, public.listens, public.comments, public.songs_sent to authenticated;
grant insert on public.artists, public.albums, public.tracks, public.reports, public.nma_proposals to authenticated;
grant insert, delete on public.ratings to authenticated;
grant update (stars, review, updated_at) on public.ratings to authenticated;
grant update (name, class_year, color, bio, photo, privacy, sharing_paused, leaderboard_opt_in, genres,
              favorite_albums, now_playing, spotify_connected, is_admin, badges) on public.profiles to authenticated;
grant insert, update (item_id) on public.nma_nominations, public.nma_votes to authenticated;
grant insert, update (nominee) on public.pred_picks to authenticated;
-- Admin-only writes (the policies above check is_admin()):
grant update on public.daily_config, public.nma_proposals, public.artists, public.tracks to authenticated;
grant insert, update, delete on public.nma_seasons, public.nma_categories, public.pred_events, public.pred_categories to authenticated;

grant execute on all functions in schema public to authenticated;

-- Live updates for Messages (Supabase Realtime). Skipped on plain Postgres.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.songs_sent;
  end if;
end $$;

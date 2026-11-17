-- Aux: Last.fm accounts, multi-genre charts, trending, and starting data for a fresh project.

-- ============================================================================
-- Last.fm: set only by the server after the student signs in to Last.fm (proving the account is theirs).
-- ============================================================================
alter table public.profiles
  add column lastfm_username text unique,
  add column lastfm_synced_at timestamptz;

create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.badges := old.badges;
  end if;
  if auth.uid() is not null then
    new.email := old.email;
    new.id := old.id;
    -- Only server code (no signed-in user) may link a Last.fm account. Students may clear it (disconnect) but never set it.
    if new.lastfm_username is not null then
      new.lastfm_username := old.lastfm_username;
      new.lastfm_synced_at := old.lastfm_synced_at;
    end if;
  end if;
  return new;
end $$;

create function public.disconnect_lastfm() returns void
language sql security definer set search_path = public as $$
  update public.profiles set lastfm_username = null, lastfm_synced_at = null where id = auth.uid()
$$;

-- ============================================================================
-- Charts: filter by any set of genres (null = all), plus a trending chart.
-- ============================================================================
drop function public.leaderboard(text, timestamptz, text);
create function public.leaderboard(p_kind text, p_since timestamptz, p_genres text[] default null)
returns table (id text, plays bigint)
language sql stable security definer set search_path = public as $$
  select case p_kind when 'songs' then t.id when 'artists' then t.artist_id else t.album_id end, count(*)
    from public.listens l
    join public.profiles p on p.id = l.user_id and p.leaderboard_opt_in
    join public.tracks t on t.id = l.track_id
    join public.artists a on a.id = t.artist_id
   where l.played_at >= p_since and (p_genres is null or a.genre = any (p_genres))
   group by 1 order by 2 desc limit 20
$$;

-- Songs climbing fastest: plays this week minus plays the week before (opted-in students only).
create function public.trending(p_genres text[] default null)
returns table (id text, plays bigint, delta bigint)
language sql stable security definer set search_path = public as $$
  with counts as (
    select l.track_id,
           count(*) filter (where l.played_at >= now() - interval '7 days') as cur,
           count(*) filter (where l.played_at < now() - interval '7 days') as prev
      from public.listens l
      join public.profiles p on p.id = l.user_id and p.leaderboard_opt_in
      join public.tracks t on t.id = l.track_id
      join public.artists a on a.id = t.artist_id
     where l.played_at >= now() - interval '14 days' and (p_genres is null or a.genre = any (p_genres))
     group by l.track_id)
  select track_id, cur, cur - prev from counts where cur - prev > 0 order by cur - prev desc limit 15
$$;

grant execute on function public.disconnect_lastfm(), public.leaderboard(text, timestamptz, text[]), public.trending(text[]) to authenticated;
revoke execute on function public.disconnect_lastfm(), public.leaderboard(text, timestamptz, text[]), public.trending(text[]) from public, anon;

-- ============================================================================
-- Starting data (safe to re-run)
-- ============================================================================
update public.daily_config set track_id = 't-juna', album_id = 'al-gnx' where track_id is null;

insert into public.nma_seasons (id, name, phase, closes_at)
values ('fall-2026', 'Fall 2026', 'nominations', now() + interval '21 days')
on conflict (id) do nothing;

insert into public.nma_categories (season_id, id, name, item_type, icon) values
  ('fall-2026', 'soty', 'Song of the Year', 'track', 'trophy'),
  ('fall-2026', 'aoty', 'Album of the Year', 'album', 'disc'),
  ('fall-2026', 'discovery', 'Best New Discovery', 'track', 'compass'),
  ('fall-2026', 'underrated', 'Most Underrated', 'track', 'gem'),
  ('fall-2026', 'study', 'Best Study Song', 'track', 'book'),
  ('fall-2026', 'gameday', 'Best Game Day Song', 'track', 'megaphone'),
  ('fall-2026', 'bus', 'Best Bus Ride Song', 'track', 'bus'),
  ('fall-2026', 'breakup', 'Best Breakup Song', 'track', 'heartbreak'),
  ('fall-2026', 'throwback', 'Best Throwback', 'track', 'cassette')
on conflict do nothing;

insert into public.pred_events (id, name, note, starts_at)
values ('grammys27', '2027 GRAMMYs', 'Sample ballot — admins replace the nominees once they are announced', '2027-02-07 20:00:00-05')
on conflict (id) do nothing;
insert into public.pred_categories (event_id, id, name, nominees) values
  ('grammys27', 'roty', 'Record of the Year', '{"luther — Kendrick Lamar","Espresso — Sabrina Carpenter","BIRDS OF A FEATHER — Billie Eilish","360 — Charli xcx"}'),
  ('grammys27', 'aoty', 'Album of the Year', '{"GNX — Kendrick Lamar","BRAT — Charli xcx","Short n'' Sweet — Sabrina Carpenter","CHROMAKOPIA — Tyler, The Creator"}'),
  ('grammys27', 'bna', 'Best New Artist', '{Doechii,"Chappell Roan",Mk.gee,"Gracie Abrams"}')
on conflict do nothing;

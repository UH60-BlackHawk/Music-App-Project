-- Aux: hardening found by Supabase's security advisor and permission checks on the real project.

-- ============================================================================
-- 1. Server functions use the service_role account; give it full access (it bypasses the security rules
--    by design and is only ever used by Edge Functions). Also for tables and functions created later.
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;
  end if;
end $$;

-- ============================================================================
-- 2. Helpers used inside the security rules move to a schema the API doesn't expose, so students can't
--    call them directly (e.g. to find out whether one student blocked another). The rules keep working:
--    policies refer to functions by identity, not by name.
-- ============================================================================
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_blocked_between(uuid, uuid) set schema private;
alter function public.is_following(uuid, uuid) set schema private;

create or replace function public.can_see(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when viewer = owner then true
    when private.is_blocked_between(viewer, owner) then false
    else coalesce((
      select not p.sharing_paused and (
               p.privacy = 'school'
               or (p.privacy = 'friends' and private.is_following(viewer, owner) and private.is_following(owner, viewer)))
        from public.profiles p where p.id = owner), false)
  end
$$;
alter function public.can_see(uuid, uuid) set schema private;

create or replace function public.can_message(sender uuid, recipient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sender <> recipient
     and not private.is_blocked_between(sender, recipient)
     and (private.is_following(sender, recipient)
          or exists (select 1 from public.songs_sent where from_id = recipient and to_id = sender))
$$;
alter function public.can_message(uuid, uuid) set schema private;

-- The "follow others" policy and the unfollow-on-block trigger referred to the helpers by name in their bodies.
create or replace function public.unfollow_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows
   where (follower = new.blocker and followee = new.blocked)
      or (follower = new.blocked and followee = new.blocker);
  return new;
end $$;

grant execute on function private.is_blocked_between(uuid, uuid), private.is_following(uuid, uuid),
  private.can_see(uuid, uuid), private.can_message(uuid, uuid) to authenticated;
revoke execute on function private.is_blocked_between(uuid, uuid), private.is_following(uuid, uuid),
  private.can_see(uuid, uuid), private.can_message(uuid, uuid) from public, anon;

-- ============================================================================
-- 3. Trigger functions never need to be called directly. (Triggers still fire: Postgres checks EXECUTE
--    when a trigger is created, not each time it runs.)
-- ============================================================================
revoke execute on function public.enforce_school_email(), public.handle_new_user(),
  public.protect_profile_columns(), public.unfollow_on_block() from public, anon, authenticated;

-- What stays callable by signed-in students, on purpose: leaderboard, trending, item_rating,
-- prediction_leaderboard, nma_ballot, nma_results (sealed until the reveal), mark_thread_read,
-- disconnect_lastfm, is_admin (your own status only), pred_open, and the admin-only
-- nma_set_phase / resolve_report (each checks is_admin() itself).

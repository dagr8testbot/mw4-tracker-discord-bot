-- MW4 Camo Tracker — Discord bot migration.
-- Run this in the Supabase SQL Editor AFTER the web app's
-- supabase/schema.sql (same project — the bot shares the website's
-- tables). It is safe to re-run.
--
-- What it changes:
--   1. camo_progress.user_id becomes nullable, and a new
--      discord_id column is added. A progress row is keyed EITHER by
--      a website user (user_id) OR by a Discord user (discord_id) —
--      never both, never neither.
--   2. profiles gets a discord_id column, so a website user can link
--      their Discord account. When linked, the bot reads/writes the
--      website rows (user_id), so ticks sync both ways.
-- The bot uses the service_role key, which bypasses row-level
-- security; the existing RLS policies still protect website users
-- (their anon-key queries can only see their own user_id rows, and
-- discord_id rows have user_id NULL, so they never leak).

alter table public.camo_progress
  alter column user_id drop not null;

alter table public.camo_progress
  add column if not exists discord_id text;

alter table public.camo_progress
  drop constraint if exists camo_progress_one_identity;

alter table public.camo_progress
  add constraint camo_progress_one_identity
  check (
    (user_id is not null and discord_id is null)
    or (user_id is null and discord_id is not null)
  );

create unique index if not exists camo_progress_discord_unique
  on public.camo_progress (discord_id, weapon_id, camo_id);

alter table public.profiles
  add column if not exists discord_id text;

create unique index if not exists profiles_discord_unique
  on public.profiles (discord_id);

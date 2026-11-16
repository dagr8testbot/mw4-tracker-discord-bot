-- MW4 Camo Tracker — Activision IDs migration.
-- Run this in the Supabase SQL Editor (same project as the bot).
-- It is safe to re-run.
--
-- What it changes:
--   A new public.activision_ids table where the bot stores each
--   Discord member's Activision ID (for /activision add / list /
--   remove), keyed by their Discord user ID. The username is saved
--   at add time so /activision list still shows a name if the
--   member later leaves the server or renames.
--   The bot uses the service_role key, which bypasses row-level
--   security; RLS is enabled with NO policy for the anon key, so
--   the website cannot read or write this table.

create table if not exists public.activision_ids (
  discord_id text primary key,
  activision_id text not null,
  username text,
  updated_at timestamptz not null default now()
);

alter table public.activision_ids enable row level security;

// Supabase access for the bot.
//
// The bot runs server-side, so it uses the SERVICE_ROLE key, which
// bypasses row-level security. That key must stay in the .env file on
// the server — never commit it, never paste it into Discord.
//
// Progress lives in the SAME tables as the web app
// (../mw4-tracker-webapp/supabase/schema.sql), plus the extra
// columns added by supabase/migration-discord.sql:
//   camo_progress.discord_id  — set when a Discord user ticks a camo
//   profiles.discord_id       — set on the website when a user links
//                               their Discord account to their web account
//
// How sync works:
//   - If the Discord user's ID is linked on a web profile
//     (profiles.discord_id), the bot reads/writes rows with that
//     profile's user_id — exactly the rows the website uses, so ticks
//     made in Discord show up on the website and vice versa.
//   - If not linked, the bot reads/writes rows keyed by discord_id.
//     The first time a link appears, any discord_id rows are merged
//     into the linked user_id rows so nothing is lost.
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let client = null;
if (config.supabaseConfigured) {
  client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function requireClient() {
  if (!client) {
    throw new Error(
      'Supabase is not configured — set SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY in .env (see README.md).'
    );
  }
  return client;
}

// Find the web-app user_id linked to this Discord user ID, if any.
async function findLinkedUserId(discordId) {
  const sb = requireClient();
  const { data, error } = await sb
    .from('profiles')
    .select('id')
    .eq('discord_id', discordId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.id : null;
}

// Merge unlinked discord_id rows into the linked user_id rows.
// Runs lazily whenever a linked account is found.
async function mergeDiscordRows(discordId, userId) {
  const sb = requireClient();
  const { data, error } = await sb
    .from('camo_progress')
    .select('weapon_id,camo_id')
    .eq('discord_id', discordId);
  if (error) throw error;
  if (!data || data.length === 0) return 0;
  const rows = data.map((r) => ({
    user_id: userId,
    weapon_id: r.weapon_id,
    camo_id: r.camo_id,
    completed: true,
  }));
  const up = await sb
    .from('camo_progress')
    .upsert(rows, { onConflict: 'user_id,weapon_id,camo_id' });
  if (up.error) throw up.error;
  const del = await sb.from('camo_progress').delete().eq('discord_id', discordId);
  if (del.error) throw del.error;
  return data.length;
}

// Resolve how this Discord user's progress is stored:
// { mode: 'linked', userId } or { mode: 'discord', discordId }
async function resolveIdentity(discordId) {
  const userId = await findLinkedUserId(discordId);
  if (userId) {
    await mergeDiscordRows(discordId, userId);
    return { mode: 'linked', userId, discordId };
  }
  return { mode: 'discord', userId: null, discordId };
}

// Load the user's completed camos as a Set of "weaponId:camoId".
async function getProgress(discordId) {
  const sb = requireClient();
  const id = await resolveIdentity(discordId);
  let query = sb.from('camo_progress').select('weapon_id,camo_id').eq('completed', true);
  query = id.mode === 'linked'
    ? query.eq('user_id', id.userId)
    : query.eq('discord_id', id.discordId);
  const { data, error } = await query;
  if (error) throw error;
  const set = new Set();
  (data || []).forEach((r) => set.add(`${r.weapon_id}:${r.camo_id}`));
  return { progress: set, linked: id.mode === 'linked' };
}

// Tick (done=true) or un-tick (done=false) one camo.
// Returns the new done state.
async function setCamo(discordId, weaponId, camoId, done) {
  const sb = requireClient();
  const id = await resolveIdentity(discordId);
  const base = id.mode === 'linked'
    ? { user_id: id.userId }
    : { discord_id: id.discordId };
  const conflict = id.mode === 'linked'
    ? 'user_id,weapon_id,camo_id'
    : 'discord_id,weapon_id,camo_id';
  if (done) {
    const { error } = await sb.from('camo_progress').upsert(
      { ...base, weapon_id: weaponId, camo_id: camoId, completed: true },
      { onConflict: conflict }
    );
    if (error) throw error;
  } else {
    let query = sb.from('camo_progress').delete()
      .eq('weapon_id', weaponId).eq('camo_id', camoId);
    query = id.mode === 'linked'
      ? query.eq('user_id', id.userId)
      : query.eq('discord_id', id.discordId);
    const { error } = await query;
    if (error) throw error;
  }
  return done;
}

// Delete all of the user's progress (used by the reset button).
async function clearProgress(discordId) {
  const sb = requireClient();
  const id = await resolveIdentity(discordId);
  let query = sb.from('camo_progress').delete();
  query = id.mode === 'linked'
    ? query.eq('user_id', id.userId)
    : query.eq('discord_id', id.discordId);
  const { error } = await query;
  if (error) throw error;
}

module.exports = {
  client,
  configured: config.supabaseConfigured,
  findLinkedUserId,
  getProgress,
  setCamo,
  clearProgress,
};

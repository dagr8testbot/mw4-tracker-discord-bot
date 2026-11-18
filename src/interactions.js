// Button + select-menu handlers for the /camo flow.
//
// Ownership: every /camo reply is ephemeral, and every component
// customId carries the owner's Discord user id
// (camo:<kind>:<ownerId>:...). Each handler checks the clicker is the
// owner before reading or writing anything — a click on someone
// else's checklist is rejected ephemerally and changes nothing.
// Buttons from before this change carry no owner id; they get a
// "run /camo again" reply instead of crashing.
const { MessageFlags } = require('discord.js');
const sb = require('./supabase');
const h = require('./helpers');

// Discord snowflake: 17-20 digits. Anything else in the owner slot
// means the button predates ownership encoding.
const OWNER_RE = /^\d{17,20}$/;

const NOT_YOURS = "That's not your checklist — run /camo to get your own.";
const STALE =
  'This checklist is from before an update — run /camo again to get a fresh one.';

// Returns true when the clicker owns this checklist. Otherwise sends
// an ephemeral rejection and returns false — the caller must stop.
async function checkOwner(interaction, ownerId) {
  if (!ownerId || !OWNER_RE.test(ownerId)) {
    await interaction.reply({ content: STALE, flags: MessageFlags.Ephemeral });
    return false;
  }
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: NOT_YOURS, flags: MessageFlags.Ephemeral });
    return false;
  }
  return true;
}

async function handleToggle(interaction) {
  // customId: camo:toggle:<ownerId>:<weaponId>:<camoId>
  const parts = interaction.customId.split(':');
  if (!(await checkOwner(interaction, parts[2]))) return;
  const weaponId = parts[3];
  const camoId = parts[4];
  const weapon = h.weaponById(weaponId);
  const camo = weapon && weapon.camos.find((c) => c.id === camoId);
  if (!weapon || !camo) {
    await interaction.reply({
      content: 'That camo no longer exists — try /camo again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!sb.configured) {
    await interaction.reply({
      content:
        'Cloud saving is not set up yet — ask the server owner to finish the Supabase setup in the bot README. Your tick was not saved.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  try {
    const { progress } = await sb.getProgress(interaction.user.id);
    const key = `${weaponId}:${camoId}`;
    const done = !progress.has(key);
    // Cascade in unlock order (special-1 → special-2 → special-3 →
    // gold → platinum → harmonic, the order of weapon.camos in data.js):
    // tapping an unticked camo completes it and everything before it
    // (you can't hold Platinum without Gold); tapping a ticked camo
    // removes it and everything after it. Earlier camos stay ticked.
    const idx = weapon.camos.findIndex((c) => c.id === camoId);
    const affected = done ? weapon.camos.slice(0, idx + 1) : weapon.camos.slice(idx);
    await sb.setCamos(interaction.user.id, weaponId, affected.map((c) => c.id), done);
    affected.forEach((c) => {
      const k = `${weaponId}:${c.id}`;
      if (done) progress.add(k); else progress.delete(k);
    });
    // The page travels in the toggle customId
    // (camo:toggle:<ownerId>:<weaponId>:<camoId>:<page>) so Back
    // returns to the same list page; pre-change buttons have no page
    // and fall back to page 0.
    const page = h.clampPage(parts[5]);
    await interaction.update({
      embeds: [h.camoEmbed(weapon, progress)],
      components: h.camoButtons(weapon, progress, interaction.user.id, page),
    });
  } catch (e) {
    console.error('toggle failed:', e);
    await interaction.reply({
      content: 'Could not save that tick right now — try again in a bit.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleBackToWeapons(interaction) {
  // customId: camo:back:weapons:<ownerId>:<page> — back from a
  // weapon's camo checklist to the full weapon list, on the same
  // page the checklist was opened from. Pre-change buttons carry a
  // class name in the page slot instead; clampPage turns that into
  // page 0, so they still land on the list.
  const parts = interaction.customId.split(':');
  if (!(await checkOwner(interaction, parts[3]))) return;
  const page = h.clampPage(parts[4]);
  let progress = new Set();
  if (sb.configured) {
    try {
      ({ progress } = await sb.getProgress(interaction.user.id));
    } catch (e) {
      console.error('getProgress failed:', e);
    }
  }
  await interaction.update({
    embeds: [h.progressEmbed(interaction.user.username, progress)],
    components: h.weaponListRows(page, interaction.user.id),
  });
}

async function handlePage(interaction) {
  // customId: camo:page:<ownerId>:<page> — Prev/Next on the weapon
  // list. Only the components change; the embed stays the progress
  // embed.
  const parts = interaction.customId.split(':');
  if (!(await checkOwner(interaction, parts[2]))) return;
  const page = h.clampPage(parts[3]);
  await interaction.update({
    components: h.weaponListRows(page, interaction.user.id),
  });
}

// Components from before the weapon-list change (class picker and
// "Back to Classes") have no handler any more; tell the user to
// re-run /camo instead of leaving the click unanswered.
async function handleLegacy(interaction) {
  await interaction.reply({ content: STALE, flags: MessageFlags.Ephemeral });
}

async function handleWeaponSelect(interaction) {
  // customId: camo:weapon:<ownerId>:<page> — value is the weapon id.
  // Pre-change selects carry a class name in the page slot instead;
  // clampPage turns that into page 0, so they still open the weapon.
  const parts = interaction.customId.split(':');
  if (!(await checkOwner(interaction, parts[2]))) return;
  const page = h.clampPage(parts[3]);
  const weapon = h.weaponById(interaction.values[0]);
  if (!weapon) {
    await interaction.reply({
      content: 'Couldn\'t find that weapon — try /camo again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  let progress = new Set();
  if (sb.configured) {
    try {
      ({ progress } = await sb.getProgress(interaction.user.id));
    } catch (e) {
      console.error('getProgress failed:', e);
    }
  }
  await interaction.update({
    embeds: [h.camoEmbed(weapon, progress)],
    components: h.camoButtons(weapon, progress, interaction.user.id, page),
  });
}

async function handle(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith('camo:toggle:')) {
    await handleToggle(interaction);
  } else if (interaction.isButton() && interaction.customId.startsWith('camo:back:weapons:')) {
    await handleBackToWeapons(interaction);
  } else if (interaction.isButton() && interaction.customId.startsWith('camo:page:')) {
    await handlePage(interaction);
  } else if (interaction.isButton() && interaction.customId.startsWith('camo:back:classes')) {
    await handleLegacy(interaction);
  } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('camo:class')) {
    await handleLegacy(interaction);
  } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('camo:weapon:')) {
    await handleWeaponSelect(interaction);
  }
}

module.exports = { handle };

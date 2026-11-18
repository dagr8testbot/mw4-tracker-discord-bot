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
    await sb.setCamo(interaction.user.id, weaponId, camoId, done);
    if (done) progress.add(key); else progress.delete(key);
    await interaction.update({
      embeds: [h.camoEmbed(weapon, progress)],
      components: h.camoButtons(weapon, progress, interaction.user.id),
    });
  } catch (e) {
    console.error('toggle failed:', e);
    await interaction.reply({
      content: 'Could not save that tick right now — try again in a bit.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleClassSelect(interaction) {
  // customId: camo:class:<ownerId> — value is the class name.
  if (!(await checkOwner(interaction, interaction.customId.split(':')[2]))) return;
  const cls = interaction.values[0];
  await interaction.update({
    components: [h.weaponSelectRow(cls, interaction.user.id), h.backToClassesRow(interaction.user.id)],
  });
}

async function handleBackToWeapons(interaction) {
  // customId: camo:back:weapons:<ownerId>:<class> — back from a
  // weapon's camo checklist to the weapon picker for the same class.
  // Restores the progress embed (refreshed, so ticks just made show
  // up) — the same view the class picker led to.
  const parts = interaction.customId.split(':');
  if (!(await checkOwner(interaction, parts[3]))) return;
  const cls = parts.slice(4).join(':');
  if (!h.data.classes.includes(cls)) {
    await interaction.reply({
      content: 'That class no longer exists — try /camo again.',
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
    embeds: [h.progressEmbed(interaction.user.username, progress)],
    components: [h.weaponSelectRow(cls, interaction.user.id), h.backToClassesRow(interaction.user.id)],
  });
}

async function handleBackToClasses(interaction) {
  // customId: camo:back:classes:<ownerId> — back from the weapon
  // picker to the class picker. The embed is already the progress
  // embed on every path that can reach the weapon picker, so only the
  // components change.
  if (!(await checkOwner(interaction, interaction.customId.split(':')[3]))) return;
  await interaction.update({
    components: [h.classSelectRow(interaction.user.id)],
  });
}

async function handleWeaponSelect(interaction) {
  // customId: camo:weapon:<ownerId>:<class> — value is the weapon id.
  const parts = interaction.customId.split(':');
  if (!(await checkOwner(interaction, parts[2]))) return;
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
    components: h.camoButtons(weapon, progress, interaction.user.id),
  });
}

async function handle(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith('camo:toggle:')) {
    await handleToggle(interaction);
  } else if (interaction.isButton() && interaction.customId.startsWith('camo:back:weapons:')) {
    await handleBackToWeapons(interaction);
  } else if (interaction.isButton() && interaction.customId.startsWith('camo:back:classes')) {
    await handleBackToClasses(interaction);
  } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('camo:class')) {
    await handleClassSelect(interaction);
  } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('camo:weapon:')) {
    await handleWeaponSelect(interaction);
  }
}

module.exports = { handle };

// Button + select-menu handlers for the /camo flow.
const { MessageFlags } = require('discord.js');
const sb = require('./supabase');
const h = require('./helpers');

async function handleToggle(interaction) {
  // customId: camo:toggle:<weaponId>:<camoId>
  const [, , weaponId, camoId] = interaction.customId.split(':');
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
      components: h.camoButtons(weapon, progress),
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
  // customId: camo:class — value is the class name.
  const cls = interaction.values[0];
  await interaction.update({
    components: [h.weaponSelectRow(cls)],
  });
}

async function handleWeaponSelect(interaction) {
  // customId: camo:weapon:<class> — value is the weapon id.
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
    components: h.camoButtons(weapon, progress),
  });
}

async function handle(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith('camo:toggle:')) {
    await handleToggle(interaction);
  } else if (interaction.isStringSelectMenu() && interaction.customId === 'camo:class') {
    await handleClassSelect(interaction);
  } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('camo:weapon:')) {
    await handleWeaponSelect(interaction);
  }
}

module.exports = { handle };

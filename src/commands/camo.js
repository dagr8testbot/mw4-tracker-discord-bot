// /camo [weapon] — the core command.
// With a weapon: that weapon's camo checklist with tick buttons.
// Without: overall progress + the class list (pick a class, then a weapon).
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const sb = require('../supabase');
const h = require('../helpers');

const NEEDS_SUPABASE =
  'Cloud saving is not set up yet — ask the server owner to finish the Supabase setup in the bot README. You can still browse camos; ticks just won\'t save.';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('camo')
    .setDescription('Show a weapon\'s camo checklist and tick camos off')
    .addStringOption((opt) =>
      opt
        .setName('weapon')
        .setDescription('Weapon name, e.g. M4')
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    await interaction.respond(h.weaponChoices(interaction.options.getFocused()));
  },

  async execute(interaction) {
    const query = interaction.options.getString('weapon');
    const userId = interaction.user.id;

    if (query) {
      const weapon = h.findWeapon(query);
      if (!weapon) {
        await interaction.reply({
          content: `Couldn't find a weapon matching "${query}". Try /camo and pick from the list.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      let progress = new Set();
      let note = '';
      if (sb.configured) {
        try {
          ({ progress } = await sb.getProgress(userId));
        } catch (e) {
          console.error('getProgress failed:', e);
          note = '\n⚠️ Could not load your saved ticks — showing an empty list.';
        }
      } else {
        note = `\n⚠️ ${NEEDS_SUPABASE}`;
      }
      await interaction.reply({
        embeds: [h.camoEmbed(weapon, progress)],
        components: h.camoButtons(weapon, progress, userId),
        content: note || undefined,
        // Ephemeral: only the invoker sees their checklist, so nobody
        // else can even see (let alone click) its buttons.
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // No weapon: overall progress + the class list.
    let progress = new Set();
    if (sb.configured) {
      try {
        ({ progress } = await sb.getProgress(userId));
      } catch (e) {
        console.error('getProgress failed:', e);
      }
    }
    await interaction.reply({
      embeds: [h.progressEmbed(interaction.user.username, progress)],
      components: h.classListRows(userId),
      // Ephemeral: only the invoker sees their checklist.
      flags: MessageFlags.Ephemeral,
    });
  },
};

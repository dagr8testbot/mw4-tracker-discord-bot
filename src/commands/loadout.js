// /loadout [weapon] — ranked loadout for one weapon, both modes.
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const h = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loadout')
    .setDescription('Show a weapon\'s ranked MW4 Multiplayer + Warzone builds')
    .addStringOption((opt) =>
      opt
        .setName('weapon')
        .setDescription('Weapon name, e.g. Cronen Osprey')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    await interaction.respond(h.weaponChoices(interaction.options.getFocused()));
  },

  async execute(interaction) {
    const weapon = h.findWeapon(interaction.options.getString('weapon'));
    if (!weapon) {
      await interaction.reply({
        content: 'Couldn\'t find that weapon. Try /loadout and pick from the list.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({ embeds: [h.loadoutEmbed(weapon)] });
  },
};

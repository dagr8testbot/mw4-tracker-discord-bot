// /updates — latest MW4 game updates / patch notes.
const { SlashCommandBuilder } = require('discord.js');
const h = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updates')
    .setDescription('Latest MW4 game updates and patch notes'),

  async execute(interaction) {
    await interaction.reply({ embeds: [h.updatesEmbed()] });
  },
};

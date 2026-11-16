// /meta — top ranked guns, best to least best, both modes.
const { SlashCommandBuilder } = require('discord.js');
const h = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meta')
    .setDescription('Top ranked MW4 guns, best to least best (WZStats, Season 1)'),

  async execute(interaction) {
    await interaction.reply({ embeds: [h.metaEmbed()] });
  },
};

// /progress — your overall camo progress.
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const sb = require('../supabase');
const h = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('progress')
    .setDescription('Show your overall camo progress'),

  async execute(interaction) {
    if (!sb.configured) {
      await interaction.reply({
        content:
          'Cloud saving is not set up yet — ask the server owner to finish the Supabase setup in the bot README.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      const { progress, linked } = await sb.getProgress(interaction.user.id);
      const embed = h.progressEmbed(interaction.user.username, progress);
      if (linked) {
        embed.setFooter({ text: 'Synced with your website account ✅' });
      } else {
        embed.setFooter({
          text: 'Not linked to a website account — use /link to sync with the website.',
        });
      }
      await interaction.reply({ embeds: [embed] });
    } catch (e) {
      console.error('getProgress failed:', e);
      await interaction.reply({
        content: 'Could not load your progress right now — try again in a bit.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

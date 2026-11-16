// /link — show your Discord user ID and whether it is linked to a
// website account, so ticks can sync between Discord and the site.
// Linking itself happens on the website (paste this ID into your web
// profile) — the bot cannot prove website ownership from Discord.
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const sb = require('../supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to the tracker website'),

  async execute(interaction) {
    const discordId = interaction.user.id;
    let linked = false;
    if (sb.configured) {
      try {
        linked = Boolean(await sb.findLinkedUserId(discordId));
      } catch (e) {
        console.error('findLinkedUserId failed:', e);
      }
    }
    const lines = [
      `Your Discord user ID is \`${discordId}\`.`,
      '',
    ];
    if (linked) {
      lines.push('✅ This Discord account is linked to a website account — your ticks sync between Discord and the website.');
    } else {
      lines.push(
        'Not linked yet. To sync your Discord ticks with the website:',
        '1. Sign in on the tracker website.',
        `2. Paste this Discord user ID (\`${discordId}\`) into your web profile's Discord field.`,
        '3. From then on, ticks made here show up on the website and vice versa.',
        '',
        'Until then, your Discord ticks are still saved — just under this Discord account only.'
      );
    }
    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  },
};

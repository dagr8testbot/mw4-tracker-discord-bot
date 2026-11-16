// /leaderboard — top 10 Discord users by ticked camos.
//
// Counts rows in public.camo_progress keyed by discord_id (website-only
// rows have discord_id NULL and are ignored). Linked website accounts
// store ticks under user_id instead, so they don't appear here —
// /progress is the right command for your own total, linked or not.
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const sb = require('../supabase');
const h = require('../helpers');

const MEDALS = ['🥇', '🥈', '🥉'];

// Short fallback name when the user can't be fetched from Discord.
function fallbackName(discordId) {
  return `Unknown user (…${discordId.slice(-4)})`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top 10 Discord users by camos ticked off'),

  async execute(interaction) {
    if (!sb.configured) {
      await interaction.reply({
        content:
          'Cloud saving is not set up yet — ask the server owner to finish the Supabase setup in the bot README.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Fetching up to 10 display names can take a moment, so defer.
    await interaction.deferReply();
    try {
      // One query: every completed tick keyed by a Discord user.
      // .range lifts the client's default 1,000-row page so a busy
      // server's ticks aren't silently cut off.
      const { data, error } = await sb.client
        .from('camo_progress')
        .select('discord_id')
        .not('discord_id', 'is', null)
        .eq('completed', true)
        .range(0, 9999);
      if (error) throw error;

      const counts = new Map();
      (data || []).forEach((r) => {
        counts.set(r.discord_id, (counts.get(r.discord_id) || 0) + 1);
      });
      const ranked = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      if (ranked.length === 0) {
        await interaction.editReply(
          'Nobody has ticked a camo yet — try /camo to start.'
        );
        return;
      }

      const names = await Promise.all(
        ranked.map(async ([discordId]) => {
          const user = await interaction.client.users
            .fetch(discordId)
            .catch(() => null);
          return user ? user.username : fallbackName(discordId);
        })
      );

      const lines = ranked.map(([discordId, count], i) => {
        const medal = MEDALS[i] || `${i + 1}.`;
        return `${medal} **${names[i]}** — ${count}/${h.TOTAL_CAMOS} camos`;
      });

      const embed = new EmbedBuilder()
        .setTitle('🏆 Camo leaderboard — top 10')
        .setDescription(lines.join('\n'))
        .setColor(0xf1c40f)
        .setFooter({
          text: 'Counts Discord ticks only — linked website progress shows in /progress. Use /camo to climb the board.',
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      console.error('leaderboard failed:', e);
      await interaction.editReply(
        'Could not load the leaderboard right now — try again in a bit.'
      );
    }
  },
};

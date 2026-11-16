// /activision — save your Activision ID and look up everyone else's.
//
//   /activision add <id>    save (or update) your Activision ID
//   /activision list        everyone who added one, plus a copyable list
//   /activision remove      delete your own saved ID
//
// Stored in public.activision_ids (supabase/migration-activision-ids.sql),
// keyed by Discord user ID. The username is saved at add time so the
// list still shows a name if the member later leaves or renames.
// The list reply is public and uses plain-text names (not @mentions),
// so nobody gets pinged when someone looks the list up.
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, escapeMarkdown } = require('discord.js');
const sb = require('../supabase');

// Activision ID shape: Name#1234567 — exactly one '#', a non-empty
// name part, and a 4–10 digit number part. Returns the trimmed ID
// or null when it doesn't match.
function parseActivisionId(raw) {
  const value = (raw || '').trim();
  const parts = value.split('#');
  if (parts.length !== 2) return null;
  const [name, number] = parts;
  if (!name || !/^\d{4,10}$/.test(number)) return null;
  return `${name}#${number}`;
}

const INVALID_MESSAGE =
  "That doesn't look like an Activision ID — it should be `Name#1234567` " +
  '(your name, then #, then the numbers). Find yours in the game under ' +
  'Settings > Account, then try `/activision add` again.';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activision')
    .setDescription("Save your Activision ID and look up everyone else's")
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Save (or update) your Activision ID')
        .addStringOption((opt) =>
          opt
            .setName('id')
            .setDescription('Your Activision ID, e.g. Name#1234567')
            .setRequired(true)
            .setMaxLength(64)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription("Show everyone's saved Activision ID")
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Delete your own saved Activision ID')
    ),

  async execute(interaction) {
    if (!sb.configured) {
      await interaction.reply({
        content:
          'Cloud saving is not set up yet — ask the server owner to finish the Supabase setup in the bot README.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'add') {
        const id = parseActivisionId(interaction.options.getString('id'));
        if (!id) {
          await interaction.reply({ content: INVALID_MESSAGE, flags: MessageFlags.Ephemeral });
          return;
        }
        await sb.upsertActivisionId(interaction.user.id, id, interaction.user.username);
        await interaction.reply({
          content:
            `Saved your Activision ID: \`${id}\` — it now shows in \`/activision list\`. ` +
            'Run `/activision add` again any time to change it.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === 'remove') {
        const existed = await sb.removeActivisionId(interaction.user.id);
        await interaction.reply({
          content: existed
            ? 'Your Activision ID was removed — it no longer shows in `/activision list`.'
            : "You don't have an Activision ID saved — nothing to remove. Use `/activision add` to save one.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // list — public, so the whole server can copy from it.
      await interaction.deferReply();
      const rows = await sb.listActivisionIds();
      if (rows.length === 0) {
        await interaction.editReply(
          'Nobody has added an Activision ID yet — be the first with `/activision add`.'
        );
        return;
      }

      // Group rows into pages that stay under Discord's limits:
      // embed description ≤ 4,096 chars, code block ≤ ~1,900 chars.
      // The first page is the reply; the rest go as follow-ups.
      const pages = [];
      let group = [];
      let nameLen = 0;
      let idLen = 0;
      const flush = () => {
        if (group.length === 0) return;
        const embed = new EmbedBuilder()
          .setTitle(`🎮 Activision IDs — ${rows.length} saved`)
          .setDescription(
            group
              .map(
                (r) =>
                  `**${escapeMarkdown(r.username || 'Unknown')}** — \`${escapeMarkdown(r.activision_id)}\``
              )
              .join('\n')
          )
          .setColor(0x2ecc71)
          .setFooter({
            text: 'Copy the IDs below to add someone in-game. Use /activision add to save or change yours.',
          });
        pages.push({
          embed,
          code: '```\n' + group.map((r) => r.activision_id).join('\n') + '\n```',
        });
        group = [];
        nameLen = 0;
        idLen = 0;
      };
      rows.forEach((r) => {
        const nameLine = `**${escapeMarkdown(r.username || 'Unknown')}** — \`${escapeMarkdown(r.activision_id)}\``;
        if (
          group.length > 0 &&
          (nameLen + 1 + nameLine.length > 4000 ||
            idLen + 1 + r.activision_id.length > 1900)
        ) {
          flush();
        }
        group.push(r);
        nameLen += (group.length > 1 ? 1 : 0) + nameLine.length;
        idLen += (group.length > 1 ? 1 : 0) + r.activision_id.length;
      });
      flush();

      await interaction.editReply({ embeds: [pages[0].embed], content: pages[0].code });
      for (let i = 1; i < pages.length; i++) {
        await interaction.followUp({ embeds: [pages[i].embed], content: pages[i].code });
      }
    } catch (e) {
      console.error('activision failed:', e);
      const content = 'Could not do that right now — try again in a bit.';
      if (sub === 'list') {
        await interaction.editReply(content).catch(() => {});
      } else if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};

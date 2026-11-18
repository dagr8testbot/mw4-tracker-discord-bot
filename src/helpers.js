// Shared helpers: weapon lookup, embeds, and the /camo message UI.
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const data = require('./data');

const TOTAL_CAMOS = data.weapons.reduce((n, w) => n + w.camos.length, 0);
const CHECK = '✅';
const BOX = '⬜';

function weaponById(id) {
  return data.weapons.find((w) => w.id === id) || null;
}

// Forgiving lookup: exact id, exact name, then substring on name/id.
function findWeapon(query) {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  if (!q) return null;
  let w = data.weapons.find((x) => x.id === q);
  if (w) return w;
  w = data.weapons.find((x) => x.name.toLowerCase() === q);
  if (w) return w;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nq = norm(q);
  w = data.weapons.find((x) => norm(x.name) === nq || norm(x.id) === nq);
  if (w) return w;
  const hits = data.weapons.filter(
    (x) => norm(x.name).includes(nq) || norm(x.id).includes(nq)
  );
  return hits.length === 1 ? hits[0] : null;
}

// Autocomplete choices for the weapon option.
function weaponChoices(query) {
  const q = (query || '').trim().toLowerCase();
  const list = !q
    ? data.weapons
    : data.weapons.filter(
        (w) => w.name.toLowerCase().includes(q) || w.id.includes(q)
      );
  return list.slice(0, 25).map((w) => ({ name: `${w.name} (${w.class})`, value: w.id }));
}

function weaponDoneCount(weapon, progress) {
  return weapon.camos.filter((c) => progress.has(`${weapon.id}:${c.id}`)).length;
}

function totalDone(progress) {
  return progress.size;
}

function tierEmoji(tier) {
  return { META: '🔴', A: '🟠', B: '🟡', C: '🟢', D: '⚪' }[tier] || '▫️';
}

// ---- /camo message ----

function camoEmbed(weapon, progress) {
  const done = weaponDoneCount(weapon, progress);
  const lines = weapon.camos.map((c) => {
    const mark = progress.has(`${weapon.id}:${c.id}`) ? CHECK : BOX;
    return `${mark} **${c.name}** (${c.tier}) — ${c.challenge}`;
  });
  const embed = new EmbedBuilder()
    .setTitle(`${weapon.name} — ${done}/${weapon.camos.length} camos`)
    .setDescription(
      `*${weapon.class}*${weapon.season === 1 ? ` · Season 1 — ${weapon.unlock}` : ''}\n\n` +
      lines.join('\n')
    )
    .setColor(done === weapon.camos.length ? 0x2ecc71 : 0xf1c40f);
  if (weapon.note) embed.setFooter({ text: `⚠️ ${weapon.note}` });
  return embed;
}

// One button per camo (6 max = 2 rows of 3). Green = done, grey = not done.
// Plus a Back row so the user can return to the weapon picker for this
// weapon's class without re-running /camo.
// Every customId carries the owner's Discord user id
// (camo:toggle:<ownerId>:... / camo:back:weapons:<ownerId>:...) so the
// handler can reject clicks from anyone else.
function camoButtons(weapon, progress, ownerId) {
  const rows = [];
  for (let i = 0; i < weapon.camos.length; i += 3) {
    const row = new ActionRowBuilder();
    weapon.camos.slice(i, i + 3).forEach((c) => {
      const done = progress.has(`${weapon.id}:${c.id}`);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`camo:toggle:${ownerId}:${weapon.id}:${c.id}`)
          .setLabel(`${done ? CHECK : BOX} ${c.name}`)
          .setStyle(done ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    });
    rows.push(row);
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`camo:back:weapons:${ownerId}:${weapon.class}`)
        .setLabel('← Back to Weapons')
        .setStyle(ButtonStyle.Secondary)
    )
  );
  return rows;
}

// Back row for the weapon picker: returns to the class picker.
function backToClassesRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`camo:back:classes:${ownerId}`)
      .setLabel('← Back to Classes')
      .setStyle(ButtonStyle.Secondary)
  );
}

// Class picker (first step when /camo has no weapon).
function classSelectRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`camo:class:${ownerId}`)
      .setPlaceholder('Pick a class…')
      .addOptions(
        data.classes.map((c) => ({ label: c, value: c }))
      )
  );
}

// Weapon picker for one class (second step).
function weaponSelectRow(cls, ownerId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`camo:weapon:${ownerId}:${cls}`)
      .setPlaceholder('Pick a weapon…')
      .addOptions(
        data.weapons
          .filter((w) => w.class === cls)
          .map((w) => ({
            label: w.name,
            value: w.id,
            description: w.season === 1 ? `Season 1 — ${w.unlock}` : w.class,
          }))
      )
  );
}

// Overall progress embed (for /camo with no weapon, and /progress).
function progressEmbed(username, progress) {
  const done = totalDone(progress);
  const lines = data.classes.map((cls) => {
    const ws = data.weapons.filter((w) => w.class === cls);
    const total = ws.reduce((n, w) => n + w.camos.length, 0);
    const got = ws.reduce((n, w) => n + weaponDoneCount(w, progress), 0);
    const bar = progressBar(got, total);
    return `**${cls}** — ${got}/${total} ${bar}`;
  });
  return new EmbedBuilder()
    .setTitle(`🎯 ${username}'s camo progress — ${done}/${TOTAL_CAMOS}`)
    .setDescription(lines.join('\n'))
    .setColor(0xf1c40f)
    .setFooter({ text: 'Use /camo to open a weapon and tick camos off.' });
}

function progressBar(got, total, width = 10) {
  const filled = total === 0 ? 0 : Math.round((got / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ---- loadout formatting ----

function buildLines(build) {
  if (!build) return null;
  const lines = [];
  if (build.apex) lines.push(`**Apex:** ${build.apex}`);
  (build.attachments || []).forEach(([slot, name]) => {
    lines.push(`• ${slot}: ${name}`);
  });
  return lines.join('\n');
}

// One mode's loadout section for /loadout (MP or Warzone).
function modeSection(weapon, mode) {
  const m = weapon[mode];
  const label = mode === 'mp' ? 'MW4 Multiplayer' : 'Warzone';
  if (!m) return `**${label}:** No data.`;
  if (m.tier === null) {
    return `**${label}:** Not yet ranked on WZStats — check back once the weapon launches.`;
  }
  const head = `**${label}:** ${tierEmoji(m.tier)} ${m.tier} · Rank #${m.rank}`;
  if (mode === 'wz') {
    if (m.status === 'none') {
      return `${head}\n> WZStats lists no Warzone build for this weapon.`;
    }
    if (m.status === 'tier-only') {
      return `${head}\n> WZStats has a Warzone build, but the attachment list isn't published as text — see it here: ${m.url}`;
    }
  }
  if (!m.build) {
    return `${head}\n> WZStats lists no ${label} build for this weapon.`;
  }
  const body = buildLines(m);
  const link = m.url ? `\n[WZStats page](${m.url})` : '';
  return `${head}\n**${m.build} build**\n${body}${link}`;
}

function loadoutEmbed(weapon) {
  const embed = new EmbedBuilder()
    .setTitle(`🔫 ${weapon.name} loadout`)
    .setDescription(
      `*${weapon.class}*${weapon.season === 1 ? ` · Season 1 — ${weapon.unlock}` : ''}\n\n` +
      modeSection(weapon, 'mp') +
      '\n\n' +
      modeSection(weapon, 'wz')
    )
    .setColor(0x3498db);
  if (weapon.note) embed.setFooter({ text: `⚠️ ${weapon.note}` });
  return embed;
}

// ---- /meta ----

function rankedList(mode, count) {
  const ranked = data.weapons
    .filter((w) => w[mode] && w[mode].tier && w[mode].rank)
    .sort((a, b) => a[mode].rank - b[mode].rank)
    .slice(0, count);
  return ranked
    .map((w, i) => `${i + 1}. ${tierEmoji(w[mode].tier)} **${w.name}** (${w[mode].tier} · ${w.class})`)
    .join('\n');
}

function metaEmbed() {
  return new EmbedBuilder()
    .setTitle('🏆 MW4 Meta — best to least best (WZStats, Season 1)')
    .setDescription(
      '**MW4 Multiplayer — Top 10**\n' + rankedList('mp', 10) +
      '\n\n**Warzone — Top 10**\n' + rankedList('wz', 10) +
      '\n\nUse `/loadout <weapon>` for the full build. JAK 12 and ZLR Talonhawk are not ranked yet.'
    )
    .setColor(0xe74c3c);
}

// ---- /updates ----

function updatesEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('📰 MW4 game updates — newest first')
    .setColor(0x9b59b6);
  data.updates.forEach((u) => {
    const bullets = u.bullets.slice(0, 3).map((b) => `• ${b}`).join('\n');
    embed.addFields({
      name: `${u.title} — ${u.publishedAt}`,
      value: `${u.summary}\n${bullets}\n[Full notes](${u.sourceUrl})`,
    });
  });
  embed.setFooter({ text: `Data as of ${data.meta.dataAsOf}. Sources: ${data.meta.sources.updates}` });
  return embed;
}

module.exports = {
  TOTAL_CAMOS,
  data,
  weaponById,
  findWeapon,
  weaponChoices,
  weaponDoneCount,
  totalDone,
  camoEmbed,
  camoButtons,
  backToClassesRow,
  classSelectRow,
  weaponSelectRow,
  progressEmbed,
  loadoutEmbed,
  metaEmbed,
  updatesEmbed,
};

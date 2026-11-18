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

// ---- per-camo-type totals ----

// Maxima are computed from data.js (37 weapons × special-1/2/3, gold,
// platinum, harmonic = 111/37/37/37), never hardcoded, so they stay
// correct if weapons or camos are added later. Progress keys are
// "weaponId:camoId"; weapon ids never contain ':', so the camo id is
// everything after the first ':'.
const CAMO_TYPES = [
  { key: 'special', label: 'Specials', ids: ['special-1', 'special-2', 'special-3'] },
  { key: 'gold', label: 'Gold', ids: ['gold'] },
  { key: 'platinum', label: 'Platinum', ids: ['platinum'] },
  { key: 'harmonic', label: 'Harmonic', ids: ['harmonic'] },
];

function typeBreakdown(progress) {
  return CAMO_TYPES.map((t) => {
    const total = data.weapons.reduce(
      (n, w) => n + w.camos.filter((c) => t.ids.includes(c.id)).length,
      0
    );
    let done = 0;
    for (const key of progress) {
      if (t.ids.includes(key.slice(key.indexOf(':') + 1))) done += 1;
    }
    return { key: t.key, label: t.label, done, total };
  });
}

function typeBreakdownLine(progress) {
  return typeBreakdown(progress)
    .map((t) => `${t.label} ${t.done}/${t.total}`)
    .join(' · ');
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
      lines.join('\n') +
      `\n\n**Your totals:** ${typeBreakdownLine(progress)}`
    )
    .setColor(done === weapon.camos.length ? 0x2ecc71 : 0xf1c40f);
  if (weapon.note) embed.setFooter({ text: `⚠️ ${weapon.note}` });
  return embed;
}

// One button per camo (6 max = 2 rows of 3). Green = done, grey = not done.
// Plus a Back row so the user can return to the view the checklist was
// opened from without re-running /camo.
// Every customId carries the owner's Discord user id
// (camo:toggle:<ownerId>:... / camo:back:weapons:<ownerId>:...) so the
// handler can reject clicks from anyone else. The toggle and Back
// customIds also carry a back token so Back returns to the same view:
// 'classes' → the class list, 'c<idx>' → that class's weapon list,
// '<n>' → page n of the legacy flat weapon list.
function camoButtons(weapon, progress, ownerId, back = 'classes') {
  const rows = [];
  for (let i = 0; i < weapon.camos.length; i += 3) {
    const row = new ActionRowBuilder();
    weapon.camos.slice(i, i + 3).forEach((c) => {
      const done = progress.has(`${weapon.id}:${c.id}`);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`camo:toggle:${ownerId}:${weapon.id}:${c.id}:${back}`)
          .setLabel(`${done ? CHECK : BOX} ${c.name}`)
          .setStyle(done ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    });
    rows.push(row);
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`camo:back:weapons:${ownerId}:${back}`)
        .setLabel(back === 'classes' ? '← Back to Classes' : '← Back to Weapons')
        .setStyle(ButtonStyle.Secondary)
    )
  );
  return rows;
}

// ---- Full weapon list (first step when /camo has no weapon) ----
//
// One select menu holds max 25 options and one message holds max 5
// action rows, so the 37 weapons are paged: 25 on page 0, 12 on
// page 1, with Prev/Next buttons to move between them.
const WEAPONS_PER_PAGE = 25;

function weaponPageCount() {
  return Math.max(1, Math.ceil(data.weapons.length / WEAPONS_PER_PAGE));
}

function clampPage(page) {
  const n = Number.parseInt(page, 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(n, 0), weaponPageCount() - 1);
}

// One page of the weapon list: a select menu + Prev/Next buttons.
function weaponSelectRow(page, ownerId) {
  const p = clampPage(page);
  const start = p * WEAPONS_PER_PAGE;
  const ws = data.weapons.slice(start, start + WEAPONS_PER_PAGE);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`camo:weapon:${ownerId}:${p}`)
      .setPlaceholder(`Pick a weapon… (page ${p + 1}/${weaponPageCount()})`)
      .addOptions(
        ws.map((w) => ({
          label: w.name,
          value: w.id,
          description: w.season === 1 ? `Season 1 — ${w.unlock}` : w.class,
        }))
      )
  );
}

function weaponListNavRow(page, ownerId) {
  const p = clampPage(page);
  const last = weaponPageCount() - 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`camo:page:${ownerId}:${p - 1}`)
      .setLabel('← Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p === 0),
    new ButtonBuilder()
      .setCustomId(`camo:page:${ownerId}:${p + 1}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p === last)
  );
}

// Both rows of the weapon list view for one page.
function weaponListRows(page, ownerId) {
  return [weaponSelectRow(page, ownerId), weaponListNavRow(page, ownerId)];
}

// ---- Class-grouped navigation (first step of /camo) ----
//
// /camo opens on the class list: one button per class (9 buttons,
// 2 rows of 5 + 4). Tapping a class edits the message in place to
// show that class's weapons; tapping a weapon opens its checklist.
// Back buttons collapse back up: checklist → weapon list for its
// class, weapon list → class list.
//
// Back tokens (carried in toggle/Back customIds, see camoButtons):
// 'classes' → the class list, 'c<idx>' → that class's weapon list,
// '<n>' → page n of the legacy flat weapon list.
function clampClass(idx) {
  const n = Number.parseInt(idx, 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(n, 0), data.classes.length - 1);
}

function classAt(idx) {
  return data.classes[clampClass(idx)];
}

function weaponsInClass(idx) {
  const cls = classAt(idx);
  return data.weapons.filter((w) => w.class === cls);
}

function parseBackToken(token) {
  if (token === 'classes' || token === undefined || token === null || token === '') {
    return { kind: 'classes' };
  }
  const t = String(token);
  if (/^c\d+$/.test(t)) return { kind: 'class', index: clampClass(t.slice(1)) };
  return { kind: 'page', page: clampPage(t) };
}

// The class list: one button per class.
function classListRows(ownerId) {
  const rows = [];
  for (let i = 0; i < data.classes.length; i += 5) {
    const row = new ActionRowBuilder();
    data.classes.slice(i, i + 5).forEach((cls, j) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`camo:class:${ownerId}:${i + j}`)
          .setLabel(cls)
          .setStyle(ButtonStyle.Secondary)
      );
    });
    rows.push(row);
  }
  return rows;
}

// One class's weapons: a select menu + a Back to Classes button.
function classWeaponRows(clsIdx, ownerId) {
  const idx = clampClass(clsIdx);
  const cls = data.classes[idx];
  const ws = weaponsInClass(idx);
  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`camo:weapon:${ownerId}:c${idx}`)
      .setPlaceholder(`Pick a weapon… (${cls})`)
      .addOptions(
        ws.map((w) => ({
          label: w.name,
          value: w.id,
          ...(w.season === 1 ? { description: `Season 1 — ${w.unlock}` } : {}),
        }))
      )
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`camo:back:classes:${ownerId}`)
      .setLabel('← Back to Classes')
      .setStyle(ButtonStyle.Secondary)
  );
  return [select, back];
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
    .addFields({ name: 'By camo type', value: typeBreakdownLine(progress) })
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
  WEAPONS_PER_PAGE,
  data,
  weaponById,
  findWeapon,
  weaponChoices,
  weaponDoneCount,
  totalDone,
  typeBreakdown,
  typeBreakdownLine,
  weaponPageCount,
  clampPage,
  clampClass,
  classAt,
  weaponsInClass,
  parseBackToken,
  classListRows,
  classWeaponRows,
  camoEmbed,
  camoButtons,
  weaponSelectRow,
  weaponListNavRow,
  weaponListRows,
  progressEmbed,
  loadoutEmbed,
  metaEmbed,
  updatesEmbed,
};

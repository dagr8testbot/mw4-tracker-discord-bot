// Mock tests: per-camo-type totals + paginated weapon list for /camo.
// Run: node test/camo-totals-and-weapon-list.test.js
// No Discord connection needed: interactions are exercised with mocks.
// The Supabase module is stubbed in-process where a test needs it;
// nothing here touches the network or the database.
'use strict';
const assert = require('node:assert/strict');
const h = require('../src/helpers');
const { handle } = require('../src/interactions');
const sb = require('../src/supabase');

const OWNER = '355161009859854336'; // Rafa's Discord user id
const OTHER = '999999999999999999';

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

// Rafa's known 164-camo set, rebuilt from the migration
// (~/workspace/mw4-camo-migration/insert_progress.sql): 28 weapons with
// specials + gold + platinum, 5 weapons with specials + gold,
// 2 weapons (rpg-8, signal-50) with special-1/2 only, and JAK 12 +
// ZLR Talonhawk with nothing. Verified against the SQL: special-1 35,
// special-2 35, special-3 33, gold 33, platinum 28, harmonic 0.
function rafa164() {
  const four = ['kg-7-vulcan', 'pm-40-anvil', 'pila', 'astaroth-57', 'jokr'];
  const two = ['rpg-8', 'signal-50'];
  const none = ['jak-12', 'zlr-talonhawk'];
  const set = new Set();
  for (const w of h.data.weapons) {
    if (none.includes(w.id)) continue;
    const camos = two.includes(w.id)
      ? ['special-1', 'special-2']
      : four.includes(w.id)
        ? ['special-1', 'special-2', 'special-3', 'gold']
        : ['special-1', 'special-2', 'special-3', 'gold', 'platinum'];
    for (const c of camos) set.add(`${w.id}:${c}`);
  }
  return set;
}

function fullSet() {
  const set = new Set();
  for (const w of h.data.weapons) {
    for (const c of w.camos) set.add(`${w.id}:${c.id}`);
  }
  return set;
}

function breakdownMap(progress) {
  const m = {};
  for (const t of h.typeBreakdown(progress)) m[t.key] = [t.done, t.total];
  return m;
}

// Minimal mock of a Discord component interaction.
function mockInteraction({ customId, values = [], userId = OWNER, button = false }) {
  const calls = { updates: [], replies: [] };
  return {
    calls,
    customId,
    values,
    user: { id: userId, username: 'Rafa' },
    isButton: () => button,
    isStringSelectMenu: () => !button,
    update: async (args) => { calls.updates.push(args); },
    reply: async (args) => { calls.replies.push(args); },
  };
}

function embedJson(embed) {
  return embed.toJSON();
}

async function main() {
  // ---- totals: maxima come from data.js ----
  await check('maxima are Specials 111, Gold 37, Platinum 37, Harmonic 37', () => {
    assert.deepEqual(breakdownMap(new Set()), {
      special: [0, 111],
      gold: [0, 37],
      platinum: [0, 37],
      harmonic: [0, 37],
    });
  });

  // ---- totals: the known 164-camo set ----
  await check('Rafa 164 set is 164 keys and breaks down 103/33/28/0', () => {
    const p = rafa164();
    assert.equal(p.size, 164);
    assert.deepEqual(breakdownMap(p), {
      special: [103, 111],
      gold: [33, 37],
      platinum: [28, 37],
      harmonic: [0, 37],
    });
    assert.equal(
      h.typeBreakdownLine(p),
      'Specials 103/111 · Gold 33/37 · Platinum 28/37 · Harmonic 0/37'
    );
  });

  // ---- totals: empty and full ----
  await check('empty user gets all zeros', () => {
    assert.equal(
      h.typeBreakdownLine(new Set()),
      'Specials 0/111 · Gold 0/37 · Platinum 0/37 · Harmonic 0/37'
    );
  });

  await check('fully-complete user gets 111/37/37/37', () => {
    assert.deepEqual(breakdownMap(fullSet()), {
      special: [111, 111],
      gold: [37, 37],
      platinum: [37, 37],
      harmonic: [37, 37],
    });
  });

  // ---- totals: shown in the embeds ----
  await check('progressEmbed has a By camo type field with the line', () => {
    const j = embedJson(h.progressEmbed('Rafa', rafa164()));
    const field = (j.fields || []).find((f) => f.name === 'By camo type');
    assert.ok(field, 'field missing');
    assert.equal(field.value, 'Specials 103/111 · Gold 33/37 · Platinum 28/37 · Harmonic 0/37');
    assert.match(j.title, /164\/222/);
  });

  await check('camoEmbed shows the totals line while ticking', () => {
    const weapon = h.weaponById('m4');
    const j = embedJson(h.camoEmbed(weapon, rafa164()));
    assert.match(
      j.description,
      /\*\*Your totals:\*\* Specials 103\/111 · Gold 33\/37 · Platinum 28\/37 · Harmonic 0\/37/
    );
    assert.match(j.title, /M4 — 5\/6 camos/);
  });

  // ---- weapon list: pagination ----
  await check('weapon list is 2 pages: 25 + 12, covering all 37 weapons once', () => {
    assert.equal(h.weaponPageCount(), 2);
    const seen = [];
    for (const page of [0, 1]) {
      const row = h.weaponSelectRow(page, OWNER).toJSON();
      assert.equal(row.components[0].type, 3, 'select menu');
      assert.equal(row.components[0].custom_id, `camo:weapon:${OWNER}:${page}`);
      assert.ok(row.components[0].options.length <= 25, 'max 25 options per menu');
      seen.push(...row.components[0].options.map((o) => o.value));
    }
    assert.equal(seen.length, 37);
    assert.equal(new Set(seen).size, 37);
    assert.deepEqual(
      [...seen].sort(),
      h.data.weapons.map((w) => w.id).sort()
    );
  });

  await check('page 0 nav: Prev disabled, Next to page 1; page 1 nav reversed', () => {
    const nav0 = h.weaponListNavRow(0, OWNER).toJSON().components;
    assert.equal(nav0[0].disabled, true);
    assert.equal(nav0[0].custom_id, `camo:page:${OWNER}:-1`);
    assert.equal(nav0[1].disabled, false);
    assert.equal(nav0[1].custom_id, `camo:page:${OWNER}:1`);
    const nav1 = h.weaponListNavRow(1, OWNER).toJSON().components;
    assert.equal(nav1[0].disabled, false);
    assert.equal(nav1[0].custom_id, `camo:page:${OWNER}:0`);
    assert.equal(nav1[1].disabled, true);
    assert.equal(nav1[1].custom_id, `camo:page:${OWNER}:2`);
  });

  await check('clampPage handles out-of-range and non-numeric pages', () => {
    assert.equal(h.clampPage(-5), 0);
    assert.equal(h.clampPage(99), 1);
    assert.equal(h.clampPage('Assault Rifles'), 0); // pre-change Back buttons
    assert.equal(h.clampPage(undefined), 0);
  });

  // ---- weapon list: selecting a weapon opens its checklist ----
  await check('picking a weapon from page 1 opens its checklist with Back to page 1', async () => {
    const it = mockInteraction({
      customId: `camo:weapon:${OWNER}:1`,
      values: ['zlr-talonhawk'],
    });
    await handle(it);
    assert.equal(it.calls.updates.length, 1);
    const upd = it.calls.updates[0];
    assert.match(embedJson(upd.embeds[0]).title, /ZLR Talonhawk/);
    const back = upd.components[2].toJSON().components[0];
    assert.equal(back.custom_id, `camo:back:weapons:${OWNER}:1`);
    assert.match(back.label, /Back to Weapons/);
  });

  // ---- weapon list: Back returns to the list on the same page ----
  await check('Back to Weapons returns to the full list on the same page', async () => {
    const it = mockInteraction({
      customId: `camo:back:weapons:${OWNER}:1`,
      button: true,
    });
    await handle(it);
    assert.equal(it.calls.updates.length, 1);
    const upd = it.calls.updates[0];
    assert.match(embedJson(upd.embeds[0]).title, /camo progress/);
    assert.match(embedJson(upd.embeds[0]).fields[0].value, /Specials 0\/111/);
    assert.equal(upd.components.length, 2);
    assert.equal(
      upd.components[0].toJSON().components[0].custom_id,
      `camo:weapon:${OWNER}:1`
    );
  });

  // ---- weapon list: Prev/Next paging keeps the progress embed ----
  await check('Next page button swaps components without touching the embed', async () => {
    const it = mockInteraction({
      customId: `camo:page:${OWNER}:1`,
      button: true,
    });
    await handle(it);
    assert.equal(it.calls.updates.length, 1);
    const upd = it.calls.updates[0];
    assert.ok(!('embeds' in upd), 'paging must not replace the embed');
    assert.equal(
      upd.components[0].toJSON().components[0].custom_id,
      `camo:weapon:${OWNER}:1`
    );
  });

  // ---- toggle keeps the list page on Back ----
  await check('ticking a camo keeps Back on the same list page', async () => {
    const saved = { configured: sb.configured, getProgress: sb.getProgress, setCamos: sb.setCamos };
    sb.configured = true;
    const progress = new Set();
    sb.getProgress = async () => ({ progress, linked: false });
    let setArgs = null;
    sb.setCamos = async (...a) => { setArgs = a; };
    try {
      const it = mockInteraction({
        customId: `camo:toggle:${OWNER}:m4:special-1:1`,
        button: true,
      });
      await handle(it);
      assert.equal(it.calls.updates.length, 1);
      const upd = it.calls.updates[0];
      assert.match(embedJson(upd.embeds[0]).title, /M4 — 1\/6 camos/);
      const back = upd.components[2].toJSON().components[0];
      assert.equal(back.custom_id, `camo:back:weapons:${OWNER}:1`);
      assert.deepEqual(setArgs, [OWNER, 'm4', ['special-1'], true]);
    } finally {
      sb.configured = saved.configured;
      sb.getProgress = saved.getProgress;
      sb.setCamos = saved.setCamos;
    }
  });

  // ---- ownership lock still applies to the new components ----
  await check("another user's click on the list is rejected, nothing changes", async () => {
    const it = mockInteraction({
      customId: `camo:weapon:${OWNER}:0`,
      values: ['m4'],
      userId: OTHER,
    });
    await handle(it);
    assert.equal(it.calls.updates.length, 0);
    assert.equal(it.calls.replies.length, 1);
    assert.match(it.calls.replies[0].content, /not your checklist/);
  });

  // ---- legacy pre-change components get the stale reply ----
  await check('old class picker and Back to Classes get the stale reply', async () => {
    const it1 = mockInteraction({ customId: `camo:class:${OWNER}` });
    await handle(it1);
    assert.equal(it1.calls.replies.length, 1);
    assert.match(it1.calls.replies[0].content, /before an update/);
    const it2 = mockInteraction({
      customId: `camo:back:classes:${OWNER}`,
      button: true,
    });
    await handle(it2);
    assert.equal(it2.calls.replies.length, 1);
    assert.match(it2.calls.replies[0].content, /before an update/);
  });

  // ---- old Back button (class in the page slot) still lands on the list ----
  await check('pre-change Back button lands on page 0 of the list', async () => {
    const it = mockInteraction({
      customId: `camo:back:weapons:${OWNER}:Assault Rifles`,
      button: true,
    });
    await handle(it);
    assert.equal(it.calls.updates.length, 1);
    assert.equal(
      it.calls.updates[0].components[0].toJSON().components[0].custom_id,
      `camo:weapon:${OWNER}:0`
    );
  });

  console.log(`\n${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

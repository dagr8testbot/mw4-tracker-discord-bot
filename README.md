# MW4 Camo Tracker — Discord Bot

Lets your friends use the MW4 Camo Tracker inside your Discord server.
It shares the tracker website's Supabase database, so camo ticks made
in Discord show up on the website too (once accounts are linked — see
`/link` below).

**Cost: $0.** Everything here uses free tiers. No accounts have been
created and nothing has been deployed — you do the setup below yourself.

## What your friends can do

| Command | What it does |
|---|---|
| `/camo` | Your overall progress (x/222) + pick a class, then a weapon |
| `/camo <weapon>` | That weapon's 6 camos with their challenges, ✅ for done ones, and buttons to tick camos off |
| `/loadout <weapon>` | The weapon's ranked MP build and Warzone build (tier + rank + attachments) |
| `/meta` | Top 10 MW4 Multiplayer + Top 10 Warzone guns, best to least best |
| `/updates` | Latest MW4 game updates / patch notes |
| `/progress` | Your overall camo progress, broken down by class |
| `/link` | Shows your Discord user ID and whether it is linked to a website account |

Honest gaps, same as the tracker: JAK 12 and ZLR Talonhawk show
"Not yet revealed" for their Special camos and are unranked; the 5
launchers/melee have no WZStats Multiplayer build; 7 weapons have no
Warzone build and 5 more are tier-only with a link out (the bot never
guesses attachments); there are no build codes anywhere (WZStats
doesn't publish any).

## What you need before you start

- A Discord server where you are the **owner or an admin** (only an
  admin can add a bot).
- The tracker website's Supabase project (the one from
  `../mw4-tracker-webapp/` — same project, same tables).
- A free [Render](https://render.com) account for hosting (or any
  computer that stays on — see step 5).
- Node.js 18 or newer on the machine you run the setup from
  (check with `node --version`).

## Step 1 — Create the bot in the Discord Developer Portal (free)

1. Go to <https://discord.com/developers/applications> and sign in
   with your Discord account.
2. Click **New Application**, name it `MW4 Camo Tracker`, Create.
3. On the left, click **Bot**, then **Reset Token** → copy the token.
   **Keep this token secret — anyone with it controls the bot.**
4. On the same Bot page, under **Privileged Gateway Intents**, leave
   everything OFF. This bot only needs slash commands, so it needs no
   special intents.
5. On the left, click **General Information** → copy the
   **Application ID**.
6. On the left, click **OAuth2 → URL Generator**. Tick the
   `bot` scope AND the `applications.commands` scope. Under **Bot
   Permissions**, tick: **Send Messages**, **Embed Links**.
   Copy the URL at the bottom — that is your invite link.
7. Open the invite link in your browser, pick your server, Authorize.
   The bot joins the server (offline until step 5).

## Step 2 — Add the Discord columns to Supabase

In the **same Supabase project the website uses**:

1. Open the Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the contents of `supabase/migration-discord.sql` and Run.
   (It adds a `discord_id` column to `camo_progress` and `profiles`.
   It is safe to re-run.)
3. In the same project, go to **Settings → API** and copy:
   - the **Project URL**, and
   - the **service_role key** (under "Project API keys").
   The service_role key bypasses the database's security rules, so it
   must only ever live on the server, in the `.env` file below.
   **Never paste it into Discord or share it with anyone.**

## Step 3 — Fill in the bot's settings

1. In this folder, copy `.env.example` to `.env`:
   - Windows: `copy .env.example .env`
   - Mac/Linux: `cp .env.example .env`
2. Open `.env` and paste in your values:
   - `DISCORD_TOKEN` — the bot token from step 1.
   - `DISCORD_CLIENT_ID` — the Application ID from step 1.
   - `SUPABASE_URL` — the Project URL from step 2.
   - `SUPABASE_SERVICE_ROLE_KEY` — the service_role key from step 2.

## Step 4 — Install, register the commands, test it

In this folder, run:

```
npm install
npm run deploy
npm start
```

- `npm run deploy` registers the 6 slash commands with Discord.
  (Global commands can take up to an hour to appear in every server
  the first time — usually a few minutes.)
- `npm start` starts the bot. You should see
  `MW4 Camo Tracker bot online as …` and the bot shows online in
  your server. Try `/camo m4` in any channel.
- Press `Ctrl+C` to stop it. The next step keeps it running for you.

## Step 5 — Host it so it stays online (free)

A Discord bot has to keep running to answer commands — your laptop
being off means the bot is offline. The easiest free option:

**Render (free tier):**
1. Push this folder to a GitHub repo (or use Render's "deploy from
   a public Git repo" with the folder).
2. In Render: **New → Background Worker**, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Under **Environment**, add the same four variables from `.env`
   (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`).
5. Create the worker. The free tier includes 750 instance-hours a
   month — enough to run one bot all month. If it restarts, it comes
   back on its own.

Alternatives: a spare computer or Raspberry Pi that stays on at home
(run `npm start` there), or Railway (free trial credit, then paid).

**Do not use Vercel or Netlify for the bot** — they host websites,
not programs that stay running, so the bot would never answer.

## How syncing with the website works

- **Not linked:** ticks made in Discord are saved in the same
  `camo_progress` table, keyed by the person's Discord user ID.
  They work fine in Discord but don't appear on the website.
- **Linked:** a website user pastes their Discord user ID into
  their web profile (the `discord_id` field — the website needs that
  one field added; see the note in `supabase/migration-discord.sql`).
  From then on the bot reads/writes that person's website rows, so
  ticks sync both ways. If they ticked camos in Discord *before*
  linking, the bot moves those ticks over automatically the first
  time it sees the link — nothing is lost.
- `/link` tells each person their Discord user ID and whether they
  are linked. (The bot can't link accounts by itself — only the
  website can prove who owns a web account.)

## Keeping the bot's data fresh

The bot's data (weapons, camos, loadouts, updates) is copied from
the tracker website at build time. When the website's data changes
(new weapons, tier moves, new patches):

```
npm run sync-data
```

then redeploy (on Render: it redeploys when you push the change to
GitHub). The bot reads its data when it starts, so a restart picks
up the new copy. If you edit the website's data by hand, re-run
`npm run sync-data` the same way.

## Troubleshooting

- **Commands don't show up:** wait up to an hour (first-time global
  registration is slow); make sure you invited the bot with the
  `applications.commands` scope (step 1.6); re-run `npm run deploy`.
- **Bot is offline:** check the host (Render → Logs) for errors;
  the most common cause is a wrong `DISCORD_TOKEN` — reset it in
  the Developer Portal and update the env var.
- **`Missing DISCORD_TOKEN`:** the `.env` file is missing or empty —
  redo step 3.
- **Ticks don't save / `/progress` errors:** check the Supabase
  values in `.env`, and that you ran the migration in step 2.
- **"Something went wrong" in Discord:** check the bot's console
  output — it logs the real error there.
- **The bot replies but buttons do nothing:** the bot process must
  be running (step 5) — button clicks go to the live bot, not to
  Discord alone.

## Files

| File | What it is |
|---|---|
| `index.js` | Starts the bot, routes commands and buttons |
| `deploy-commands.js` | Registers the slash commands (`npm run deploy`) |
| `src/data.js` | All tracker data (37 weapons, 222 camos, loadouts, settings, updates) — generated, do not edit by hand |
| `src/commands/` | The 6 slash commands (`camo`, `loadout`, `meta`, `updates`, `progress`, `link`) |
| `src/interactions.js` | Tick buttons + class/weapon pickers |
| `src/supabase.js` | Progress storage + Discord↔website linking |
| `src/helpers.js` | Embeds, weapon lookup, rank lists |
| `src/config.js` | Reads `.env` |
| `supabase/migration-discord.sql` | Adds `discord_id` columns (run once, step 2) |
| `tools/sync_data.js` | Re-copies data from the website (`npm run sync-data`) |
| `.env.example` | Template for the secrets file (never commit a real `.env`) |

// MW4 Camo Tracker — Discord bot entry point.
// Slash commands live in src/commands/; buttons + select menus in
// src/interactions.js. Run `npm run deploy` once first to register
// the slash commands with Discord, then `npm start`.
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const config = require('./src/config');
const interactions = require('./src/interactions');

if (!config.discordToken) {
  console.error('Missing DISCORD_TOKEN in .env — see README.md step 2.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

for (const file of fs.readdirSync(path.join(__dirname, 'src', 'commands'))) {
  if (!file.endsWith('.js')) continue;
  const cmd = require(path.join(__dirname, 'src', 'commands', file));
  client.commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, (c) => {
  console.log(`MW4 Camo Tracker bot online as ${c.user.tag}`);
  if (!require('./src/config').supabaseConfigured) {
    console.warn(
      'Supabase is NOT configured — /camo ticks and /progress will not save. ' +
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (README.md step 3).'
    );
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
    } else if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd && cmd.autocomplete) await cmd.autocomplete(interaction);
    } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await interactions.handle(interaction);
    }
  } catch (e) {
    console.error('Interaction failed:', e);
    const reply = {
      content: 'Something went wrong — try again in a bit.',
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// Tiny HTTP endpoint so the bot can run as a free Render Web Service:
// Render expects the service to listen on $PORT, and the uptime pinger
// hits this URL every few minutes to keep the free instance awake.
const http = require('http');
if (process.env.PORT) {
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('MW4 Camo Tracker bot is running.\n');
  }).listen(process.env.PORT, () => {
    console.log(`Health endpoint listening on port ${process.env.PORT}`);
  });
}

client.login(config.discordToken);

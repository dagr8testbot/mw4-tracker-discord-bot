// Register the slash commands with Discord (globally, so they work
// in every server the bot is in). Run once after setup, and again
// after adding or changing a command:
//   npm run deploy
// Needs DISCORD_TOKEN and DISCORD_CLIENT_ID in .env.
// Global commands can take up to an hour to appear everywhere.
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./src/config');

if (!config.discordToken || !config.clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env — see README.md.');
  process.exit(1);
}

const commands = [];
for (const file of fs.readdirSync(path.join(__dirname, 'src', 'commands'))) {
  if (!file.endsWith('.js')) continue;
  const cmd = require(path.join(__dirname, 'src', 'commands', file));
  commands.push(cmd.data.toJSON());
}

(async () => {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const data = await rest.put(
    Routes.applicationCommands(config.clientId),
    { body: commands }
  );
  console.log(`Registered ${data.length} slash commands: ${commands.map((c) => '/' + c.name).join(', ')}`);
})().catch((e) => {
  console.error('Failed to register commands:', e);
  process.exit(1);
});

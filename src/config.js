// Environment config. Copy .env.example to .env and fill it in.
// Nothing secret is ever committed — see .gitignore.
require('dotenv').config();

const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};

config.supabaseConfigured =
  Boolean(config.supabaseUrl) && Boolean(config.supabaseServiceKey);

module.exports = config;

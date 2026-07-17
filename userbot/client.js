const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

/**
 * Creates and connects the GramJS client for your real Telegram account,
 * using the session string generated once via `npm run login`.
 */
async function createUserbotClient() {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;
  const sessionString = process.env.TG_SESSION_STRING;

  if (!apiId || !apiHash || !sessionString) {
    throw new Error(
      'Missing TG_API_ID, TG_API_HASH, or TG_SESSION_STRING. Run `npm run login` first and copy the ' +
      'printed session string into your .env / host env vars.'
    );
  }

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5
  });

  await client.connect();
  const me = await client.getMe();
  console.log(`👤 Userbot connected as: ${me.firstName || ''} (@${me.username || me.id})`);

  return client;
}

module.exports = { createUserbotClient };

// Run ONCE, interactively, with: npm run login
// This logs into YOUR real Telegram account (phone number + code, and 2FA
// password if you have one enabled) and prints a session string. Paste that
// string into TG_SESSION_STRING in your .env (or your host's env vars) —
// after that, the bot logs in silently every time without asking again.
//
// Treat the session string exactly like a password. Anyone who has it can
// act as your Telegram account. Never commit it, never paste it anywhere
// public.

require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;

if (!apiId || !apiHash) {
  console.error('❌ Set TG_API_ID and TG_API_HASH in .env first (get them from https://my.telegram.org).');
  process.exit(1);
}

(async () => {
  console.log('🔐 Echo login — this connects to YOUR real Telegram account.\n');

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5
  });

  await client.start({
    phoneNumber: async () => await input.text('Phone number (with country code, e.g. +234...): '),
    password: async () => await input.text('2FA password (leave blank if you don\'t have one): '),
    phoneCode: async () => await input.text('Code Telegram just sent you: '),
    onError: (err) => console.error(err)
  });

  console.log('\n✅ Logged in successfully!\n');
  console.log('Copy this session string into TG_SESSION_STRING in your .env:\n');
  console.log(client.session.save());
  console.log('\n⚠️  Keep this secret — it is equivalent to your Telegram password.');

  await client.disconnect();
  process.exit(0);
})();

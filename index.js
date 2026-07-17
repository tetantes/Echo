require('dotenv').config();
const express = require('express');
const { NewMessage } = require('telegram/events');
const { Raw } = require('telegram/events/Raw');

const { createUserbotClient } = require('./userbot/client');
const { createMessageHandler } = require('./userbot/messageHandler');
const { createDeletedMessageHandler } = require('./userbot/deletedMessageHandler');
const clientRegistry = require('./userbot/clientRegistry');
const { createPanelBot } = require('./panel/panelBot');
const { pool } = require('./config/database');

async function main() {
  // 1. Control panel bot first — so it can report errors even if the userbot fails to connect.
  const panelBot = createPanelBot();

  // 2. Your real Telegram account.
  const client = await createUserbotClient();
  clientRegistry.set(client);

  // The panel bot's own DMs to you must never be treated as incoming chat
  // messages needing an AI reply — otherwise Echo tries to "answer" its own
  // control-panel notifications, which is exactly the loop this guards against.
  const panelBotInfo = await panelBot.getMe();

  client.addEventHandler(createMessageHandler(client, panelBot, panelBotInfo.id), new NewMessage({}));
  client.addEventHandler(createDeletedMessageHandler(panelBot), new Raw({}));

  try {
    await panelBot.sendMessage(process.env.OWNER_TELEGRAM_ID, '🎛️ Echo is online. Send /panel to open the control panel.');
  } catch (err) {
    console.error('Could not send startup message to owner — make sure you have started a chat with the panel bot at least once.');
  }

  console.log('🤖 Echo is fully running — userbot + panel bot both connected.');

  // 3. Tiny health-check server, same purpose as in FLUXX: keep a free-tier host awake via an external ping.
  const app = express();
  const PORT = process.env.PORT || 3001;
  app.get('/', (req, res) => res.send('Echo is running ✅'));
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ok', time: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });
  app.listen(PORT, () => console.log(`🌐 Health-check server listening on port ${PORT}`));
}

main().catch((err) => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

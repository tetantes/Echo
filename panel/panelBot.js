const TelegramBot = require('node-telegram-bot-api');
const router = require('../utils/callbackRouter');
const state = require('../utils/state');
const { isOwner } = require('../middleware/ownerOnly');

// Requiring these triggers their router.on(...) / state.registerTextHandler(...)
// side-effect registrations — same pattern as FLUXX's admin panel.
require('./handlers/mainHandler');
require('./handlers/chatTypesHandler');
require('./handlers/mutedChatsHandler');
require('./handlers/sleepHoursHandler');
require('./handlers/keywordsHandler');
require('./handlers/knowMeHandler');
require('./handlers/postChannelHandler');
require('./handlers/botActionsHandler');
require('./handlers/rewriteHandler');
require('./handlers/activityHandler');
require('./handlers/geminiKeyHandler');
require('./handlers/safetyHandler');
require('./handlers/draftActionsHandler');

const { renderMainPanel } = require('./handlers/mainHandler');

function createPanelBot() {
  const token = process.env.PANEL_BOT_TOKEN;
  if (!token) throw new Error('PANEL_BOT_TOKEN is not set.');

  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/^\/(start|panel)$/, async (msg) => {
    if (!isOwner(msg.from.id)) {
      await bot.sendMessage(msg.chat.id, '❌ This bot is private.');
      return;
    }
    const sent = await bot.sendMessage(msg.chat.id, '🎛️ Loading panel...');
    await renderMainPanel(bot, msg.chat.id, sent.message_id);
  });

  bot.on('callback_query', async (query) => {
    try {
      await router.dispatch(bot, query);
    } catch (err) {
      console.error('Panel callback_query error:', err);
      try { await bot.answerCallbackQuery(query.id, { text: '❌ Something went wrong.', show_alert: true }); } catch (_) {}
    }
  });

  bot.on('message', async (msg) => {
    try {
      if (!isOwner(msg.from.id)) return;
      if (msg.text && msg.text.startsWith('/')) return; // commands handled by onText

      const handledByState = await state.dispatchText(bot, msg);
      if (handledByState) return;

      // Ad-hoc translation: "translate <text>" typed directly to the panel bot,
      // no need to be inside a specific chat or use the ".tr" in-chat command.
      const translateMatch = (msg.text || '').match(/^translate[:\s]+([\s\S]+)$/i);
      if (translateMatch) {
        const geminiService = require('../services/geminiService');
        try {
          const result = await geminiService.translateToEnglish(translateMatch[1].trim());
          const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          await bot.sendMessage(
            msg.chat.id,
            `🌐 <b>Translation</b>\n<i>Detected: ${esc(result.detected_language)}</i>\n\nEnglish:\n"${esc(result.translation)}"`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          await bot.sendMessage(msg.chat.id, `❌ Translation failed: ${err.message}`);
        }
      }
    } catch (err) {
      console.error('Panel message handler error:', err);
    }
  });

  bot.on('polling_error', (err) => console.error('Panel bot polling error:', err.message));

  console.log('🎛️ Panel bot is running...');
  return bot;
}

module.exports = { createPanelBot };

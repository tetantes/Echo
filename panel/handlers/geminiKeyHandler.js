const settingsService = require('../../services/settingsService');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const state = require('../../utils/state');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

router.on('panel:geminikey', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  const currentKey = await settingsService.get('gemini_api_key', '');
  const masked = currentKey ? `${currentKey.slice(0, 6)}...${currentKey.slice(-4)}` : 'not set';
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  state.setState(query.from.id, 'awaiting_gemini_key', {}, { chatId, messageId });
  await safeEdit(
    bot, chatId, messageId,
    `🔑 <b>Gemini API Key</b>\n\nCurrent: <code>${masked}</code>\n\n` +
    `Get a free key at aistudio.google.com/apikey, then send it here (message auto-deletes right after):`,
    keyboards.cancelKeyboard()
  );
}));

async function handleKeyInput(bot, msg, userState) {
  const { chatId, messageId } = userState;
  const key = (msg.text || '').trim();
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  if (!key || key.length < 20) {
    await safeEdit(bot, chatId, messageId, `❌ That doesn't look like a valid key. Try again:`, keyboards.cancelKeyboard());
    return;
  }

  await settingsService.set('gemini_api_key', key);
  state.clearState(msg.from.id);
  await safeEdit(bot, chatId, messageId, `✅ Gemini key saved.`, keyboards.backToPanelKeyboard());
}

state.registerTextHandler('awaiting_gemini_key', handleKeyInput);

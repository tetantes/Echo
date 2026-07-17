const geminiService = require('../../services/geminiService');
const knowMe = require('../../userbot/knowMe');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const state = require('../../utils/state');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

router.on('panel:rewrite', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  state.setState(query.from.id, 'awaiting_rewrite_text', {}, { chatId, messageId });
  await safeEdit(bot, chatId, messageId, `✍️ <b>Rewrite</b>\n\nSend the text you want rewritten — you'll get formal, casual, and shorter versions to pick from:`, keyboards.cancelKeyboard());
}));

async function handleRewriteInput(bot, msg, userState) {
  const { chatId, messageId } = userState;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  await safeEdit(bot, chatId, messageId, `✍️ <i>Rewriting...</i>`, { inline_keyboard: [] });

  try {
    const profile = await knowMe.getProfile();
    const variants = await geminiService.rewriteText(msg.text, profile?.profile_text || '');
    state.clearState(msg.from.id);

    const text =
      `✍️ <b>Rewrite Options</b>\n\n` +
      `<b>Formal:</b>\n${escapeHtml(variants.formal)}\n\n` +
      `<b>Casual:</b>\n${escapeHtml(variants.casual)}\n\n` +
      `<b>Shorter:</b>\n${escapeHtml(variants.shorter)}\n\n` +
      `<i>Copy whichever fits — this doesn't send anything.</i>`;
    await safeEdit(bot, chatId, messageId, text, keyboards.backToPanelKeyboard());
  } catch (err) {
    await safeEdit(bot, chatId, messageId, `❌ Failed: ${err.message}`, keyboards.backToPanelKeyboard());
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

state.registerTextHandler('awaiting_rewrite_text', handleRewriteInput);

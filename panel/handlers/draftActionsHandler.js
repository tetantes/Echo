const draftStore = require('../draftStore');
const clientRegistry = require('../../userbot/clientRegistry');
const settingsService = require('../../services/settingsService');
const safetyService = require('../../services/safetyService');
const state = require('../../utils/state');
const { safeAnswer } = require('../../utils/telegram');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

router.on('draft:send:*', requireOwner(async (bot, query, [draftId]) => {
  const draft = draftStore.get(draftId);
  if (!draft) {
    await safeAnswer(bot, query.id, { text: 'This draft expired.', show_alert: true });
    return;
  }

  try {
    const client = clientRegistry.get();
    const signatureEnabled = await settingsService.getBool('signature_enabled', true);
    const finalText = signatureEnabled ? `${draft.draftText}\n<i>— AI generated response</i>` : draft.draftText;

    await client.sendMessage(draft.chatId, { message: finalText, parseMode: 'html' });
    draftStore.remove(draftId);
    await safetyService.logActivity(draft.chatId, null, 'auto_reply', draft.draftText);

    await safeAnswer(bot, query.id, { text: '✅ Sent!' });
    await bot.editMessageText(`✅ Sent!\n\n<i>${escapeHtml(draft.draftText)}</i>`, {
      chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'HTML'
    });
  } catch (err) {
    await safeAnswer(bot, query.id, { text: `Failed: ${err.message}`, show_alert: true });
  }
}));

router.on('draft:discard:*', requireOwner(async (bot, query, [draftId]) => {
  draftStore.remove(draftId);
  await safeAnswer(bot, query.id, { text: 'Discarded.' });
  await bot.editMessageText(`🗑️ Draft discarded — nothing was sent.`, {
    chat_id: query.message.chat.id, message_id: query.message.message_id
  });
}));

router.on('draft:edit:*', requireOwner(async (bot, query, [draftId]) => {
  const draft = draftStore.get(draftId);
  if (!draft) {
    await safeAnswer(bot, query.id, { text: 'This draft expired.', show_alert: true });
    return;
  }
  await safeAnswer(bot, query.id);
  state.setState(query.from.id, 'awaiting_draft_edit', { draftId }, { chatId: query.message.chat.id, messageId: query.message.message_id });
  await bot.editMessageText(`✏️ Send the replacement text for this draft:`, {
    chat_id: query.message.chat.id, message_id: query.message.message_id
  });
}));

async function handleDraftEditInput(bot, msg, userState) {
  const { draftId } = userState.data;
  const draft = draftStore.get(draftId);
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  if (!draft) {
    await bot.editMessageText(`❌ This draft expired.`, { chat_id: userState.chatId, message_id: userState.messageId });
    state.clearState(msg.from.id);
    return;
  }

  const updated = draftStore.update(draftId, { draftText: msg.text });
  state.clearState(msg.from.id);

  await bot.editMessageText(
    `✍️ <b>Draft updated</b>\n\n<i>${escapeHtml(updated.draftText)}</i>`,
    {
      chat_id: userState.chatId,
      message_id: userState.messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Send', callback_data: `draft:send:${draftId}` },
          { text: '✏️ Edit', callback_data: `draft:edit:${draftId}` },
          { text: '🗑️ Discard', callback_data: `draft:discard:${draftId}` }
        ]]
      }
    }
  );
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

state.registerTextHandler('awaiting_draft_edit', handleDraftEditInput);

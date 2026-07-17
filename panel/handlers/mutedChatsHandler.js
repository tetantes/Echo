const chatOverrideService = require('../../services/chatOverrideService');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

router.on('panel:mutedchats', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  await renderMutedChats(bot, query.message.chat.id, query.message.message_id);
}));

async function renderMutedChats(bot, chatId, messageId) {
  const muted = await chatOverrideService.listMuted();
  let text;
  if (muted.length === 0) {
    text =
      `🔇 <b>Muted Chats</b>\n\nNo chats have anything muted right now.\n\n` +
      `<i>Type ".ai off" in any chat to mute AI replies there (keyword macros still work).\n` +
      `Type ".kw off" to mute keyword macros there instead (AI still works, if enabled).\n` +
      `".ai on" / ".kw on" re-enables each.</i>`;
  } else {
    text = `🔇 <b>Muted Chats</b>\n\n`;
    muted.forEach((c) => {
      const flags = [c.ai_disabled ? 'AI off' : null, c.keywords_disabled ? 'Keywords off' : null].filter(Boolean).join(', ');
      text += `• ${c.peer_name || c.peer_id} — ${flags}\n`;
    });
  }
  await safeEdit(bot, chatId, messageId, text, keyboards.mutedChatsKeyboard(muted));
}

router.on('panel:mutedchats:unmuteai:*', requireOwner(async (bot, query, [peerId]) => {
  await safeAnswer(bot, query.id, { text: 'AI unmuted.' });
  await chatOverrideService.setAiOverride(peerId, null, false);
  await renderMutedChats(bot, query.message.chat.id, query.message.message_id);
}));

router.on('panel:mutedchats:unmutekw:*', requireOwner(async (bot, query, [peerId]) => {
  await safeAnswer(bot, query.id, { text: 'Keywords unmuted.' });
  await chatOverrideService.setKeywordsOverride(peerId, null, false);
  await renderMutedChats(bot, query.message.chat.id, query.message.message_id);
}));

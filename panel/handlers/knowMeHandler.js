const knowMe = require('../../userbot/knowMe');
const clientRegistry = require('../../userbot/clientRegistry');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

router.on('panel:knowme', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  const existing = await knowMe.getProfile();
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  const text = existing?.profile_text
    ? `🧠 <b>Know Me</b>\n\nCurrent profile (built from ${existing.sample_count} messages):\n\n<i>${escapeHtml(existing.profile_text)}</i>\n\nTap below to rebuild it fresh from your recent chats.`
    : `🧠 <b>Know Me</b>\n\nNo profile built yet.`;

  await safeEdit(bot, chatId, messageId, text, {
    inline_keyboard: [
      [{ text: '🔄 Rebuild Profile', callback_data: 'panel:knowme:rebuild' }],
      [{ text: '⬅️ Back', callback_data: 'panel:main' }]
    ]
  });
}));

router.on('panel:knowme:rebuild', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id, { text: 'Scanning your recent chats...' });
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  await safeEdit(bot, chatId, messageId, `🧠 <b>Know Me</b>\n\n<i>Scanning your recent messages across chats to learn your writing style...</i>`, { inline_keyboard: [] });

  try {
    const client = clientRegistry.get();
    const result = await knowMe.buildProfile(client);

    if (!result.success) {
      await safeEdit(bot, chatId, messageId, `🧠 <b>Know Me</b>\n\n❌ ${result.reason}`, keyboards.backToPanelKeyboard());
      return;
    }

    await safeEdit(
      bot, chatId, messageId,
      `🧠 <b>Know Me — Profile Updated</b>\n\nBuilt from ${result.sampleCount} of your recent messages:\n\n<i>${escapeHtml(result.profileText)}</i>`,
      keyboards.backToPanelKeyboard()
    );
  } catch (err) {
    await safeEdit(bot, chatId, messageId, `❌ Failed to build profile: ${escapeHtml(err.message)}`, keyboards.backToPanelKeyboard());
  }
}));

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

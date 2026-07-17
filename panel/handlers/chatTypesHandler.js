const settingsService = require('../../services/settingsService');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');
const { renderMainPanel } = require('./mainHandler');

async function renderChatTypes(bot, chatId, messageId) {
  const settings = await settingsService.getAll();
  await safeEdit(
    bot, chatId, messageId,
    `🌐 <b>Chat Types</b>\n\n` +
    `Each is independent — turn on whichever combination you actually want Echo active in:\n\n` +
    `👤 Private DMs — real people messaging you directly\n` +
    `👥 Groups — any group or channel (bot senders in groups are always ignored — not a setting, just a safety rule)\n` +
    `🤖 Bot DMs — other bots messaging you directly\n` +
    `🔔 Mention/Reply Only — in groups, only engage when @mentioned or replied to, instead of every message`,
    keyboards.chatTypesKeyboard(settings)
  );
}

router.on('panel:chattypes', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  await renderChatTypes(bot, query.message.chat.id, query.message.message_id);
}));

router.on('panel:chattypes:dm:toggle', requireOwner(async (bot, query) => {
  const current = await settingsService.getBool('dm_enabled', true);
  await settingsService.set('dm_enabled', !current);
  await safeAnswer(bot, query.id, { text: `Private DMs ${!current ? 'enabled' : 'disabled'}` });
  await renderChatTypes(bot, query.message.chat.id, query.message.message_id);
}));

router.on('panel:chattypes:groups:toggle', requireOwner(async (bot, query) => {
  const current = await settingsService.getBool('groups_enabled', false);
  await settingsService.set('groups_enabled', !current);
  await safeAnswer(bot, query.id, { text: `Groups ${!current ? 'enabled' : 'disabled'}` });
  await renderChatTypes(bot, query.message.chat.id, query.message.message_id);
}));

router.on('panel:chattypes:bots:toggle', requireOwner(async (bot, query) => {
  const current = await settingsService.getBool('bot_dms_enabled', false);
  await settingsService.set('bot_dms_enabled', !current);
  await safeAnswer(bot, query.id, { text: `Bot DMs ${!current ? 'enabled' : 'disabled'}` });
  await renderChatTypes(bot, query.message.chat.id, query.message.message_id);
}));

router.on('panel:chattypes:mentiononly:toggle', requireOwner(async (bot, query) => {
  const current = await settingsService.getBool('group_mention_only', true);
  await settingsService.set('group_mention_only', !current);
  await safeAnswer(bot, query.id, { text: `Mention/Reply Only ${!current ? 'enabled' : 'disabled'}` });
  await renderChatTypes(bot, query.message.chat.id, query.message.message_id);
}));

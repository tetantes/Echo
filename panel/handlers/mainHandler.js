const settingsService = require('../../services/settingsService');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

async function renderMainPanel(bot, chatId, messageId) {
  const settings = await settingsService.getAll();
  const chatTypesSummary = [
    settings.dm_enabled === 'true' ? 'DMs' : null,
    settings.groups_enabled === 'true' ? 'Groups' : null,
    settings.bot_dms_enabled === 'true' ? 'Bot DMs' : null
  ].filter(Boolean).join(', ') || 'none';

  const text =
    `🎛️ <b>ECHO CONTROL PANEL</b>\n\n` +
    `Mode: <b>${settings.mode}</b>\n` +
    `Active in: <b>${chatTypesSummary}</b>\n` +
    `Signature: <b>${settings.signature_enabled === 'true' ? 'on' : 'off'}</b>`;
  await safeEdit(bot, chatId, messageId, text, keyboards.mainPanelKeyboard(settings));
}

router.on('panel:main', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  await renderMainPanel(bot, query.message.chat.id, query.message.message_id);
}));

router.on('panel:mode', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  await safeEdit(bot, query.message.chat.id, query.message.message_id, `🎚️ <b>Choose a mode</b>\n\n🟢 Auto-Pilot — replies fully on its own\n🟡 Draft — drafts replies here for your approval, never sends by itself\n🌙 Sleep Hours — acts like Auto-Pilot only during your configured window\n🔴 Silent — logs everything, replies to nothing`, keyboards.modeKeyboard());
}));

router.on('panel:mode:set:*', requireOwner(async (bot, query, [mode]) => {
  await settingsService.set('mode', mode);
  await safeAnswer(bot, query.id, { text: `Mode set to ${mode}` });
  await renderMainPanel(bot, query.message.chat.id, query.message.message_id);
}));

router.on('panel:signature:toggle', requireOwner(async (bot, query) => {
  const current = await settingsService.getBool('signature_enabled', true);
  await settingsService.set('signature_enabled', !current);
  await safeAnswer(bot, query.id, { text: `Signature ${!current ? 'enabled' : 'disabled'}` });
  await renderMainPanel(bot, query.message.chat.id, query.message.message_id);
}));

router.on('panel:forceenglish:toggle', requireOwner(async (bot, query) => {
  const current = await settingsService.getBool('force_english_replies', true);
  await settingsService.set('force_english_replies', !current);
  await safeAnswer(bot, query.id, { text: `Force English ${!current ? 'enabled' : 'disabled'}` });
  await renderMainPanel(bot, query.message.chat.id, query.message.message_id);
}));

module.exports = { renderMainPanel };

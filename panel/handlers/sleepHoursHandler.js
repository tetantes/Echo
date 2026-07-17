const settingsService = require('../../services/settingsService');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const state = require('../../utils/state');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');
const { renderMainPanel } = require('./mainHandler');

router.on('panel:sleephours', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  const start = await settingsService.getNumber('sleep_start_hour', 23);
  const end = await settingsService.getNumber('sleep_end_hour', 7);
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  state.setState(query.from.id, 'awaiting_sleep_hours', {}, { chatId, messageId });
  await safeEdit(
    bot, chatId, messageId,
    `🌙 <b>Sleep Hours</b>\n\nCurrently: <b>${start}:00 → ${end}:00</b> (${process.env.TG_TIMEZONE || 'Africa/Lagos'})\n\n` +
    `Send the new window as two 24-hour numbers separated by a dash, e.g. <code>23-7</code> for 11pm–7am:`,
    keyboards.cancelKeyboard()
  );
}));

async function handleSleepHoursInput(bot, msg, userState) {
  const { chatId, messageId } = userState;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  const match = (msg.text || '').trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!match) {
    await safeEdit(bot, chatId, messageId, `❌ Format like <code>23-7</code>. Try again:`, keyboards.cancelKeyboard());
    return;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 23 || start < 0 || end < 0) {
    await safeEdit(bot, chatId, messageId, `❌ Hours must be 0-23. Try again:`, keyboards.cancelKeyboard());
    return;
  }

  await settingsService.set('sleep_start_hour', start);
  await settingsService.set('sleep_end_hour', end);
  state.clearState(msg.from.id);

  await safeEdit(bot, chatId, messageId, `✅ Sleep hours set to ${start}:00 → ${end}:00`, keyboards.backToPanelKeyboard());
}

state.registerTextHandler('awaiting_sleep_hours', handleSleepHoursInput);

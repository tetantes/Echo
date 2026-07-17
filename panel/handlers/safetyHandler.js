const safetyService = require('../../services/safetyService');
const settingsService = require('../../services/settingsService');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

router.on('panel:safety', requireOwner(async (bot, cbQuery) => {
  await safeAnswer(bot, cbQuery.id);
  const maxPerHour = await settingsService.getNumber('max_replies_per_hour', 20);
  const recentEvents = await safetyService.getRecentSafetyEvents(5);

  let text =
    `🛡️ <b>Safety Status</b>\n\n` +
    `Auto-reply cap: <b>${maxPerHour}/hour</b>\n` +
    `Broadcast detection: <i>same text to 3+ chats within 5 min gets blocked</i>\n` +
    `Burst detection: <i>15+ messages/minute across chats triggers a warning</i>\n\n`;

  if (recentEvents.length === 0) {
    text += `✅ No safety events recently — looking healthy.`;
  } else {
    text += `<b>Recent flags:</b>\n`;
    recentEvents.forEach((e) => {
      text += `• ${escapeHtml(e.detail || e.event_type)}\n`;
    });
  }

  await safeEdit(bot, cbQuery.message.chat.id, cbQuery.message.message_id, text, keyboards.backToPanelKeyboard());
}));

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

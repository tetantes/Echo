const { query } = require('../../config/database');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

const TYPE_LABELS = {
  auto_reply: '🟢 Auto-replied',
  draft: '🟡 Drafted',
  flagged: '🚩 Flagged for you',
  keyword_match: '🔑 Keyword match',
  skipped_low_confidence: '⏭️ Skipped (low confidence)',
  skipped_silent_mode: '🔴 Skipped (silent mode)',
  skipped_outside_sleep_hours: '🌙 Skipped (outside sleep hours)',
  skipped_ai_disabled_for_chat: '🔇 Skipped (AI muted for this chat)',
  safety_block: '🛑 Blocked (safety)',
  burst_warning: '⚠️ Burst warning'
};

router.on('panel:activity', requireOwner(async (bot, cbQuery) => {
  await safeAnswer(bot, cbQuery.id);
  const logs = await query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 15');

  let text = `📋 <b>Recent Activity</b>\n\n`;
  if (logs.length === 0) {
    text += 'Nothing logged yet.';
  } else {
    for (const log of logs) {
      const label = TYPE_LABELS[log.event_type] || log.event_type;
      const time = new Date(log.created_at).toLocaleString('en-GB', { timeZone: process.env.TG_TIMEZONE || 'Africa/Lagos', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      const peer = log.peer_name ? `${escapeHtml(log.peer_name)} — ` : '';
      const detail = log.detail ? escapeHtml(log.detail.slice(0, 80)) : '';
      text += `${label}\n<i>${peer}${detail}</i>\n<i>${time}</i>\n\n`;
    }
  }

  await safeEdit(bot, cbQuery.message.chat.id, cbQuery.message.message_id, text, keyboards.backToPanelKeyboard());
}));

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

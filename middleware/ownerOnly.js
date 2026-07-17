const { safeAnswer } = require('../utils/telegram');

function isOwner(telegramId) {
  return String(telegramId) === String(process.env.OWNER_TELEGRAM_ID);
}

function requireOwner(handler) {
  return async (bot, query, params) => {
    if (!isOwner(query.from.id)) {
      await safeAnswer(bot, query.id, { text: '❌ This panel is private.', show_alert: true });
      return;
    }
    return handler(bot, query, params);
  };
}

module.exports = { isOwner, requireOwner };

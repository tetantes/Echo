const messageCache = require('./messageCache');

/**
 * Recovers messages that get deleted shortly after being sent to you —
 * ONLY if Echo was already running and had cached them first (see the big
 * comment in messageCache.js for why this can't reach further back than that).
 */
function createDeletedMessageHandler(panelBot) {
  return async (update) => {
    let recovered = [];

    if (update.className === 'UpdateDeleteChannelMessages') {
      const chatId = update.channelId?.toString();
      for (const messageId of update.messages) {
        const cached = messageCache.get(chatId, messageId);
        if (cached) {
          recovered.push(cached);
          messageCache.remove(chatId, messageId);
        }
      }
    } else if (update.className === 'UpdateDeleteMessages') {
      // Regular chats/DMs don't include chat scoping on delete — search by message ID instead.
      for (const messageId of update.messages) {
        const cached = messageCache.findByMessageIdAnyChat(messageId);
        if (cached) {
          recovered.push(cached);
          messageCache.remove(cached.chatId, messageId);
        }
      }
    } else {
      return; // not a delete update
    }

    for (const msg of recovered) {
      // Only human-sent messages matter for recovery — bots deleting their own
      // messages (e.g. a menu bot editing/cleaning up) isn't the "someone
      // deleted what they said to me" case this feature is actually for.
      if (msg.senderId === undefined || msg.isBot) continue;
      try {
        await panelBot.sendMessage(
          process.env.OWNER_TELEGRAM_ID,
          `🗑️ <b>Recovered a deleted message</b>\n\n👤 ${escapeHtml(msg.senderName || 'Unknown')}\n💬 "${escapeHtml(msg.text)}"\n\n<i>They deleted this right after sending it.</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('Failed to notify owner of recovered message:', err.message);
      }
    }
  };
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { createDeletedMessageHandler };

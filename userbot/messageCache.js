/**
 * Telegram's delete event only gives you message IDs, never the content —
 * by design, once deleted, it's gone from the server. The ONLY way to
 * "recover" a deleted message is to have already cached it client-side
 * before it was deleted. This means Echo can only recover messages sent
 * AFTER it started running and BEFORE they were deleted — it cannot reach
 * back further than that. That's a hard platform limitation, not a bug.
 *
 * In-memory only (not persisted) — this is short-lived scratch data, and
 * keeping it out of the DB avoids storing a rolling copy of private
 * messages at rest.
 */

const cache = new Map(); // `${chatId}:${messageId}` -> { text, senderId, senderName, chatId, timestamp }
const TTL_MS = 2 * 60 * 60 * 1000; // keep 2 hours of history — enough to catch delayed deletes

function key(chatId, messageId) {
  return `${chatId}:${messageId}`;
}

function store(chatId, messageId, data) {
  cache.set(key(chatId, messageId), { ...data, cachedAt: Date.now() });
}

function get(chatId, messageId) {
  return cache.get(key(chatId, messageId)) || null;
}

function remove(chatId, messageId) {
  cache.delete(key(chatId, messageId));
}

/**
 * For regular (non-channel) chats, Telegram's delete update does NOT tell you
 * which chat the deleted message belonged to — only the message ID. So for
 * that case we have to search across all cached entries instead of doing a
 * direct key lookup.
 */
function findByMessageIdAnyChat(messageId) {
  for (const [k, v] of cache.entries()) {
    if (k.endsWith(`:${messageId}`)) return { key: k, ...v };
  }
  return null;
}

// Periodic cleanup so this doesn't grow unbounded on a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.cachedAt > TTL_MS) cache.delete(k);
  }
}, 15 * 60 * 1000);

module.exports = { store, get, remove, findByMessageIdAnyChat };

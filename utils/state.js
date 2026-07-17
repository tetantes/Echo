const store = new Map();
const textHandlers = new Map();
const DEFAULT_TTL_MS = 15 * 60 * 1000;

function setState(telegramId, action, data = {}, extra = {}) {
  store.set(String(telegramId), { action, data, chatId: extra.chatId, messageId: extra.messageId, expiresAt: Date.now() + DEFAULT_TTL_MS });
}

function getState(telegramId) {
  const s = store.get(String(telegramId));
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    store.delete(String(telegramId));
    return null;
  }
  return s;
}

function clearState(telegramId) {
  store.delete(String(telegramId));
}

function registerTextHandler(action, handler) {
  textHandlers.set(action, handler);
}

async function dispatchText(bot, msg) {
  const s = getState(msg.from.id);
  if (!s) return false;
  const handler = textHandlers.get(s.action);
  if (!handler) return false;
  await handler(bot, msg, s);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (now > val.expiresAt) store.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = { setState, getState, clearState, registerTextHandler, dispatchText };

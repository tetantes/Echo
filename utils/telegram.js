async function safeEdit(bot, chatId, messageId, text, keyboard) {
  try {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: keyboard, parse_mode: 'HTML', disable_web_page_preview: true });
    return messageId;
  } catch (err) {
    const desc = err?.response?.body?.description || err.message || '';
    if (desc.includes('message is not modified')) return messageId;
    try { await bot.deleteMessage(chatId, messageId); } catch (_) {}
    const sent = await bot.sendMessage(chatId, text, { reply_markup: keyboard, parse_mode: 'HTML', disable_web_page_preview: true });
    return sent.message_id;
  }
}

async function safeAnswer(bot, callbackQueryId, opts = {}) {
  try {
    await bot.answerCallbackQuery(callbackQueryId, opts);
  } catch (_) {}
}

module.exports = { safeEdit, safeAnswer };

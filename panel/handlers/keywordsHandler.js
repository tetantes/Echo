const keywordService = require('../../services/keywordService');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const state = require('../../utils/state');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

router.on('panel:keywords', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  await renderList(bot, query);
}));

async function renderList(bot, query) {
  const macros = await keywordService.list();
  const text = macros.length === 0
    ? `🔑 <b>Keywords</b>\n\nNo canned responses yet.\n\n<i>Add one, e.g. trigger "price" → response "Check our pinned post for pricing!"</i>`
    : `🔑 <b>Keywords</b>\n\nTap one to manage it:`;
  await safeEdit(bot, query.message.chat.id, query.message.message_id, text, keyboards.keywordsKeyboard(macros));
}

router.on('panel:keywords:view:*', requireOwner(async (bot, query, [id]) => {
  await safeAnswer(bot, query.id);
  const macros = await keywordService.list();
  const macro = macros.find((m) => String(m.id) === id);
  if (!macro) return;
  const text =
    `🔑 <b>Keyword Macro</b>\n\n` +
    `Trigger (${macro.match_type}): <code>${escapeHtml(macro.trigger_text)}</code>\n` +
    `Response: <i>${escapeHtml(macro.response_text)}</i>\n` +
    `Status: ${macro.is_active ? '🟢 Active' : '⚪ Inactive'}`;
  await safeEdit(bot, query.message.chat.id, query.message.message_id, text, keyboards.keywordDetailKeyboard(macro));
}));

router.on('panel:keywords:toggle:*', requireOwner(async (bot, query, [id]) => {
  await safeAnswer(bot, query.id);
  await keywordService.toggle(id);
  const macros = await keywordService.list();
  const macro = macros.find((m) => String(m.id) === id);
  await safeEdit(bot, query.message.chat.id, query.message.message_id, `Status: ${macro.is_active ? '🟢 Active' : '⚪ Inactive'}`, keyboards.keywordDetailKeyboard(macro));
}));

router.on('panel:keywords:remove:*', requireOwner(async (bot, query, [id]) => {
  await safeAnswer(bot, query.id);
  await keywordService.remove(id);
  await renderList(bot, query);
}));

router.on('panel:keywords:add', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  state.setState(query.from.id, 'awaiting_keyword_trigger', {}, { chatId, messageId });
  await safeEdit(
    bot, chatId, messageId,
    `➕ <b>Add Keyword</b>\n\nStep 1/2 — Send the trigger word/phrase (matches if the incoming message CONTAINS this, case-insensitive):`,
    keyboards.cancelKeyboard('panel:keywords')
  );
}));

async function handleTriggerInput(bot, msg, userState) {
  const { chatId, messageId } = userState;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  const trigger = (msg.text || '').trim();
  if (!trigger) {
    await safeEdit(bot, chatId, messageId, `❌ Enter some text:`, keyboards.cancelKeyboard('panel:keywords'));
    return;
  }

  state.setState(msg.from.id, 'awaiting_keyword_response', { trigger }, { chatId, messageId });
  await safeEdit(bot, chatId, messageId, `➕ <b>Add Keyword</b>\n\nStep 2/2 — Now send the exact response to auto-send when this matches:`, keyboards.cancelKeyboard('panel:keywords'));
}

async function handleResponseInput(bot, msg, userState) {
  const { chatId, messageId } = userState;
  const { trigger } = userState.data;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  const response = (msg.text || '').trim();
  if (!response) {
    await safeEdit(bot, chatId, messageId, `❌ Enter some text:`, keyboards.cancelKeyboard('panel:keywords'));
    return;
  }

  await keywordService.add(trigger, response, 'contains');
  state.clearState(msg.from.id);

  await safeEdit(bot, chatId, messageId, `✅ Keyword added!\n\nTrigger: "${escapeHtml(trigger)}"\nResponse: "${escapeHtml(response)}"`, keyboards.backToPanelKeyboard());
}

state.registerTextHandler('awaiting_keyword_trigger', handleTriggerInput);
state.registerTextHandler('awaiting_keyword_response', handleResponseInput);

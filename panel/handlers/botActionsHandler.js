const botActions = require('../../userbot/botActions');
const clientRegistry = require('../../userbot/clientRegistry');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const state = require('../../utils/state');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

router.on('panel:botactions', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  await safeEdit(
    bot, query.message.chat.id, query.message.message_id,
    `🤖 <b>Bot Actions</b>\n\n<i>These always run once, right now, when you ask — Echo never messages other bots on its own.</i>`,
    keyboards.botActionsKeyboard()
  );
}));

router.on('panel:botactions:send', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  state.setState(query.from.id, 'awaiting_botaction_send_target', {}, { chatId, messageId });
  await safeEdit(bot, chatId, messageId, `✉️ <b>Send Message to a Bot</b>\n\nStep 1/2 — Send the bot's @username:`, keyboards.cancelKeyboard('panel:botactions'));
}));

async function handleSendTarget(bot, msg, userState) {
  const { chatId, messageId } = userState;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}
  const target = (msg.text || '').trim();
  state.setState(msg.from.id, 'awaiting_botaction_send_text', { target }, { chatId, messageId });
  await safeEdit(bot, chatId, messageId, `✉️ Step 2/2 — Send the message text to send to ${target}:`, keyboards.cancelKeyboard('panel:botactions'));
}

async function handleSendText(bot, msg, userState) {
  const { chatId, messageId } = userState;
  const { target } = userState.data;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  try {
    const client = clientRegistry.get();
    await botActions.sendMessageToBot(client, target, msg.text);
    state.clearState(msg.from.id);
    await safeEdit(bot, chatId, messageId, `✅ Sent to ${target}.`, keyboards.backToPanelKeyboard());
  } catch (err) {
    await safeEdit(bot, chatId, messageId, `❌ Failed: ${err.message}`, keyboards.backToPanelKeyboard());
  }
}

router.on('panel:botactions:click', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  state.setState(query.from.id, 'awaiting_botaction_click_target', {}, { chatId, messageId });
  await safeEdit(bot, chatId, messageId, `🖱️ <b>Click a Button</b>\n\nStep 1/2 — Send the bot's @username:`, keyboards.cancelKeyboard('panel:botactions'));
}));

async function handleClickTarget(bot, msg, userState) {
  const { chatId, messageId } = userState;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}
  const target = (msg.text || '').trim();
  state.setState(msg.from.id, 'awaiting_botaction_click_text', { target }, { chatId, messageId });
  await safeEdit(bot, chatId, messageId, `🖱️ Step 2/2 — Send the button label to click (or part of it):`, keyboards.cancelKeyboard('panel:botactions'));
}

async function handleClickText(bot, msg, userState) {
  const { chatId, messageId } = userState;
  const { target } = userState.data;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  try {
    const client = clientRegistry.get();
    const result = await botActions.clickButtonOnLastMessage(client, target, msg.text);
    state.clearState(msg.from.id);

    if (!result.success) {
      await safeEdit(bot, chatId, messageId, `❌ ${result.reason}`, keyboards.backToPanelKeyboard());
      return;
    }
    if (result.type === 'url') {
      await safeEdit(bot, chatId, messageId, `🔗 That's a link button — open it yourself:\n${result.url}`, keyboards.backToPanelKeyboard());
      return;
    }
    await safeEdit(bot, chatId, messageId, `✅ Clicked!\n\nBot responded: <i>${escapeHtml(result.message)}</i>`, keyboards.backToPanelKeyboard());
  } catch (err) {
    await safeEdit(bot, chatId, messageId, `❌ Failed: ${err.message}`, keyboards.backToPanelKeyboard());
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

state.registerTextHandler('awaiting_botaction_send_target', handleSendTarget);
state.registerTextHandler('awaiting_botaction_send_text', handleSendText);
state.registerTextHandler('awaiting_botaction_click_target', handleClickTarget);
state.registerTextHandler('awaiting_botaction_click_text', handleClickText);

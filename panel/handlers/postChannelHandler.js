const settingsService = require('../../services/settingsService');
const clientRegistry = require('../../userbot/clientRegistry');
const keyboards = require('../keyboards');
const { safeEdit, safeAnswer } = require('../../utils/telegram');
const state = require('../../utils/state');
const router = require('../../utils/callbackRouter');
const { requireOwner } = require('../../middleware/ownerOnly');

router.on('panel:postchannel', requireOwner(async (bot, query) => {
  await safeAnswer(bot, query.id);
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const channelHandle = await settingsService.get('post_channel', '');

  state.setState(query.from.id, 'awaiting_channel_post', {}, { chatId, messageId });
  await safeEdit(
    bot, chatId, messageId,
    `📢 <b>Post to Channel</b>\n\n` +
    `Target: <code>${channelHandle || 'not set — send it as @channelusername first'}</code>\n\n` +
    (channelHandle
      ? `Send the text you want posted, or send a new <code>@channelusername</code> to change the target first:`
      : `Send your channel's @username to set the target (only needs doing once):`),
    keyboards.cancelKeyboard()
  );
}));

async function handlePostInput(bot, msg, userState) {
  const { chatId, messageId } = userState;
  try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (_) {}

  const text = (msg.text || '').trim();

  if (text.startsWith('@')) {
    await settingsService.set('post_channel', text);
    state.clearState(msg.from.id);
    await safeEdit(bot, chatId, messageId, `✅ Channel target set to ${text}. Tap 📢 Post to Channel again to post something.`, keyboards.backToPanelKeyboard());
    return;
  }

  const channelHandle = await settingsService.get('post_channel', '');
  if (!channelHandle) {
    await safeEdit(bot, chatId, messageId, `❌ Set a channel first — send <code>@channelusername</code>:`, keyboards.cancelKeyboard());
    return;
  }

  try {
    const client = clientRegistry.get();
    await client.sendMessage(channelHandle, { message: text });
    state.clearState(msg.from.id);
    await safeEdit(bot, chatId, messageId, `✅ Posted to ${channelHandle}!`, keyboards.backToPanelKeyboard());
  } catch (err) {
    await safeEdit(bot, chatId, messageId, `❌ Failed to post: ${err.message}\n\nMake sure your account is an admin of that channel.`, keyboards.cancelKeyboard());
  }
}

state.registerTextHandler('awaiting_channel_post', handlePostInput);

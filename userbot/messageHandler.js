const settingsService = require('../services/settingsService');
const keywordService = require('../services/keywordService');
const geminiService = require('../services/geminiService');
const contactMemoryService = require('../services/contactMemoryService');
const safetyService = require('../services/safetyService');
const errorThrottle = require('../services/errorThrottle');
const chatOverrideService = require('../services/chatOverrideService');
const messageCache = require('./messageCache');
const knowMe = require('./knowMe');

const TIMEZONE = process.env.TG_TIMEZONE || 'Africa/Lagos';

function currentHourInTimezone() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: '2-digit', hour12: false }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour').value);
}

async function isWithinSleepWindow() {
  const startHour = await settingsService.getNumber('sleep_start_hour', 23);
  const endHour = await settingsService.getNumber('sleep_end_hour', 7);
  const currentHour = currentHourInTimezone();

  if (startHour === endHour) return true; // 24h sleep mode edge case
  if (startHour < endHour) {
    return currentHour >= startHour && currentHour < endHour;
  }
  return currentHour >= startHour || currentHour < endHour;
}

/**
 * Three independent chat-type toggles, PLUS a hard safety rule: bot senders
 * in GROUPS are always ignored, no setting for it — two bots able to reply
 * to each other in a shared group is a real risk (loops, spam-looking
 * behavior) with no legitimate upside, so this isn't optional.
 * Bot DMs (a bot messaging you directly) stay separately toggleable, since
 * that's a deliberate one-on-one situation you might actually want.
 */
async function isChatAllowed(isGroupOrChannel, senderIsBot) {
  if (isGroupOrChannel) {
    if (senderIsBot) return false; // hard rule, not a setting
    return settingsService.getBool('groups_enabled', false);
  }
  if (senderIsBot) return settingsService.getBool('bot_dms_enabled', false);
  return settingsService.getBool('dm_enabled', true);
}

/**
 * In groups, only engage if the message actually mentions you or is a
 * reply to something you sent — otherwise Echo would be reacting to every
 * unrelated line of group chatter, which is both useless and risky.
 * Off by default toggle available in the panel if you want full coverage instead.
 */
async function shouldEngageInGroup(message) {
  const mentionOnly = await settingsService.getBool('group_mention_only', true);
  if (!mentionOnly) return true;

  if (message.mentioned) return true; // Telegram's own "this update mentions you" flag
  if (message.isReply) {
    try {
      const replied = await message.getReplyMessage();
      if (replied?.out) return true; // a reply to something you sent
    } catch (_) { /* fall through */ }
  }
  return false;
}

const AI_TOGGLE_COMMAND_REGEX = /^\.ai\s+(on|off|status)$/i;
const KW_TOGGLE_COMMAND_REGEX = /^\.kw\s+(on|off|status)$/i;
const TRANSLATE_COMMAND_REGEX = /^\.tr(anslate)?$/i;

/**
 * @param client GramJS client (your real account)
 * @param panelBot node-telegram-bot-api instance (the control panel bot)
 * @param panelBotId the panel bot's own numeric Telegram ID — its DMs to you must
 *   never be treated as incoming messages needing a reply, or Echo ends up trying
 *   to "answer" its own control panel notifications.
 */
function createMessageHandler(client, panelBot, panelBotId) {
  return async (event) => {
    const message = event.message;
    if (!message) return;

    const chatId = message.chatId?.toString() || message.peerId?.toString();
    const senderIdEarly = message.senderId?.toString();

    // Never process messages from the panel bot itself — those are Echo's own
    // notifications to you (drafts, flags, warnings), not real incoming chats.
    if (panelBotId && senderIdEarly === String(panelBotId)) return;

    const isGroupOrChannel = message.isGroup || message.isChannel;

    // ==================== YOUR OWN OUTGOING MESSAGES ====================
    // Watches for risky burst patterns from your real typing, AND catches
    // the in-chat commands (.ai, .kw, .tr) that only make sense on a message
    // YOU just sent in that specific conversation.
    if (message.out) {
      const text = (message.message || '').trim();

      const aiMatch = text.match(AI_TOGGLE_COMMAND_REGEX);
      if (aiMatch) {
        await handleAiToggleCommand(client, panelBot, message, chatId, aiMatch[1].toLowerCase());
        return;
      }

      const kwMatch = text.match(KW_TOGGLE_COMMAND_REGEX);
      if (kwMatch) {
        await handleKeywordToggleCommand(client, panelBot, message, chatId, kwMatch[1].toLowerCase());
        return;
      }

      if (TRANSLATE_COMMAND_REGEX.test(text)) {
        await handleTranslateCommand(client, panelBot, message, chatId);
        return;
      }

      const burstCheck = safetyService.recordOwnMessageAndCheckBurst();
      if (burstCheck.risky) {
        await notifyOwner(panelBot, `⚠️ <b>Safety Warning</b>\n\n${burstCheck.reason}`);
        await safetyService.logActivity(chatId, null, 'burst_warning', burstCheck.reason);
      }
      return;
    }

    if (!message.message) return; // media-only messages with no text — skip for now

    const senderId = message.senderId?.toString();
    const senderInfo = await getSenderInfo(client, message);
    const senderName = senderInfo.name;

    // Cache every incoming message briefly so a delete right after can still be recovered.
    messageCache.store(chatId, message.id, {
      text: message.message,
      senderId,
      senderName,
      chatId,
      isGroupOrChannel,
      isBot: senderInfo.isBot
    });

    if (!(await isChatAllowed(isGroupOrChannel, senderInfo.isBot))) return;

    if (isGroupOrChannel && !(await shouldEngageInGroup(message))) {
      return; // not mentioned/replied to — not worth logging, this is just normal group noise
    }

    const mode = await settingsService.get('mode', 'draft');

    // ==================== KEYWORD MACROS ====================
    // These bypass mode gating entirely (fire even in Silent/outside Sleep
    // hours) — a canned response is deterministic and low-risk regardless of
    // what mode AI replies are in. The ONLY thing that can stop a keyword
    // macro is ".kw off" specifically in that chat.
    const keywordsDisabledHere = await chatOverrideService.isKeywordsDisabled(chatId);
    if (!keywordsDisabledHere) {
      const macro = await keywordService.findMatch(message.message);
      if (macro) {
        await attemptSend(client, panelBot, message, chatId, senderId, senderName, macro.response_text, mode, 'keyword_match');
        return;
      }
    }

    // ==================== MODE GATING (AI portion only, from here down) ====================
    if (mode === 'silent') {
      await safetyService.logActivity(chatId, senderName, 'skipped_silent_mode', message.message.slice(0, 200));
      return;
    }
    if (mode === 'sleep' && !(await isWithinSleepWindow())) {
      await safetyService.logActivity(chatId, senderName, 'skipped_outside_sleep_hours', message.message.slice(0, 200));
      return;
    }

    // ==================== PER-CHAT AI MUTE ====================
    if (await chatOverrideService.isAiDisabled(chatId)) {
      await safetyService.logActivity(chatId, senderName, 'skipped_ai_disabled_for_chat', message.message.slice(0, 200));
      return;
    }

    // ==================== AI CONFIDENCE-GATED REPLY ====================
    const voiceProfileRow = await knowMe.getProfile();
    const contactNotes = await contactMemoryService.getNotesForPeer(senderId);
    const history = await getRecentHistory(client, message);

    let aiResult;
    try {
      aiResult = await geminiService.generateReply({
        voiceProfile: voiceProfileRow?.profile_text || '',
        contactNotes,
        history,
        incomingText: message.message
      });
    } catch (err) {
      console.error('Gemini call failed:', err.message);
      await safetyService.logActivity(chatId, senderName, 'skipped_low_confidence', `Gemini error: ${err.message.slice(0, 150)}`);

      const errorKey = `gemini_error:${err.message.slice(0, 60)}`;
      if (errorThrottle.shouldNotify(errorKey)) {
        await notifyOwner(
          panelBot,
          `⚠️ <b>Gemini is failing</b>\n\n${escapeHtml(err.message)}\n\n` +
          `<i>This is likely an ongoing problem (bad key, wrong model, or quota) — you won't be re-notified for the same error for 15 minutes, but every affected message is still logged in 📋 Activity.</i>`
        );
      }
      return;
    }

    if (!aiResult.should_reply) {
      await safetyService.logActivity(chatId, senderName, 'flagged', aiResult.reason);
      await notifyOwner(
        panelBot,
        `🚩 <b>Needs your reply</b>\n\n👤 ${escapeHtml(senderName)}\n💬 "${escapeHtml(message.message)}"\n\n<i>Echo's reason: ${escapeHtml(aiResult.reason)}</i>`
      );
      return;
    }

    await attemptSend(client, panelBot, message, chatId, senderId, senderName, aiResult.reply, mode, 'auto_reply');
  };
}

/**
 * Shared send path for both keyword macros and AI replies — always runs
 * through the same safety checks and mode handling (auto vs draft).
 */
async function attemptSend(client, panelBot, message, chatId, senderId, senderName, replyText, mode, logType) {
  const broadcastCheck = safetyService.checkBroadcastPattern(replyText, chatId);
  if (broadcastCheck.risky) {
    await safetyService.logActivity(chatId, senderName, 'safety_block', broadcastCheck.reason);
    await notifyOwner(panelBot, `🛑 <b>Blocked a reply for your safety</b>\n\n${escapeHtml(broadcastCheck.reason)}\n\n👤 ${escapeHtml(senderName)} — reply was NOT sent.`);
    return;
  }

  if (mode === 'draft') {
    await sendDraftForApproval(panelBot, chatId, senderId, senderName, message.id, replyText);
    await safetyService.logActivity(chatId, senderName, 'draft', replyText);
    return;
  }

  // mode === 'auto' (or 'sleep' currently inside its window — same send path)
  const rateCheck = await safetyService.canSendAutoReply();
  if (!rateCheck.allowed) {
    await notifyOwner(panelBot, `⏸️ <b>Auto-reply paused</b>\n\n${escapeHtml(rateCheck.reason)}\n\n👤 ${escapeHtml(senderName)} is waiting for a reply.`);
    return;
  }

  const signatureEnabled = await settingsService.getBool('signature_enabled', true);
  const finalText = signatureEnabled ? `${replyText}\n<i>— AI generated response</i>` : replyText;

  await client.sendMessage(message.peerId, { message: finalText, parseMode: 'html' });
  safetyService.recordAutoReply();
  await safetyService.logActivity(chatId, senderName, logType, replyText);
}

async function sendDraftForApproval(panelBot, chatId, senderId, senderName, sourceMessageId, draftText) {
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  const draftStore = require('../panel/draftStore');
  const draftId = draftStore.save({ chatId, senderId, draftText });

  await panelBot.sendMessage(
    ownerId,
    `✍️ <b>Draft reply ready</b>\n\n👤 ${escapeHtml(senderName)}\n\n<i>${escapeHtml(draftText)}</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Send', callback_data: `draft:send:${draftId}` },
          { text: '✏️ Edit', callback_data: `draft:edit:${draftId}` },
          { text: '🗑️ Discard', callback_data: `draft:discard:${draftId}` }
        ]]
      }
    }
  );
}

async function notifyOwner(panelBot, text) {
  try {
    await panelBot.sendMessage(process.env.OWNER_TELEGRAM_ID, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Failed to notify owner via panel bot:', err.message);
  }
}

// ==================== IN-CHAT COMMANDS ====================

async function handleAiToggleCommand(client, panelBot, message, chatId, action) {
  const chatName = await getChatName(client, message);

  if (action === 'status') {
    const disabled = await chatOverrideService.isAiDisabled(chatId);
    await ephemeralSelfNotice(client, message, `🤖 AI is currently ${disabled ? 'OFF' : 'ON'} in this chat.`);
    return;
  }

  const disabled = action === 'off';
  await chatOverrideService.setAiOverride(chatId, chatName, disabled);
  try { await client.deleteMessages(message.peerId, [message.id], { revoke: true }); } catch (_) {}
  await notifyOwner(panelBot, `${disabled ? '🔇' : '🔊'} AI ${disabled ? 'disabled' : 're-enabled'} for this chat (${escapeHtml(chatName)}). Keyword macros still work there either way.`);
}

async function handleKeywordToggleCommand(client, panelBot, message, chatId, action) {
  const chatName = await getChatName(client, message);

  if (action === 'status') {
    const disabled = await chatOverrideService.isKeywordsDisabled(chatId);
    await ephemeralSelfNotice(client, message, `🔑 Keyword macros are currently ${disabled ? 'OFF' : 'ON'} in this chat.`);
    return;
  }

  const disabled = action === 'off';
  await chatOverrideService.setKeywordsOverride(chatId, chatName, disabled);
  try { await client.deleteMessages(message.peerId, [message.id], { revoke: true }); } catch (_) {}
  await notifyOwner(panelBot, `${disabled ? '🔇' : '🔊'} Keyword macros ${disabled ? 'disabled' : 're-enabled'} for this chat (${escapeHtml(chatName)}).`);
}

/**
 * ".tr" / ".translate" typed right after receiving a foreign-language
 * message — translates the most recent INCOMING message in that chat and
 * sends you the result privately via the panel bot (never in the real chat).
 */
async function handleTranslateCommand(client, panelBot, message, chatId) {
  try { await client.deleteMessages(message.peerId, [message.id], { revoke: true }); } catch (_) {}

  try {
    const recentMessages = await client.getMessages(message.peerId, { limit: 10 });
    const lastIncoming = recentMessages.find((m) => !m.out && m.message);

    if (!lastIncoming) {
      await notifyOwner(panelBot, `🌐 No recent incoming message found in this chat to translate.`);
      return;
    }

    const result = await geminiService.translateToEnglish(lastIncoming.message);
    const chatName = await getChatName(client, message);
    await notifyOwner(
      panelBot,
      `🌐 <b>Translation</b> (${escapeHtml(chatName)})\n` +
      `<i>Detected: ${escapeHtml(result.detected_language)}</i>\n\n` +
      `Original:\n"${escapeHtml(lastIncoming.message)}"\n\n` +
      `English:\n"${escapeHtml(result.translation)}"`
    );
  } catch (err) {
    await notifyOwner(panelBot, `❌ Translation failed: ${escapeHtml(err.message)}`);
  }
}

/**
 * @returns {{ name: string, isBot: boolean }}
 */
async function getSenderInfo(client, message) {
  try {
    const sender = await message.getSender();
    const name = sender?.firstName || sender?.username || sender?.title || 'Unknown';
    const isBot = !!sender?.bot;
    return { name, isBot };
  } catch (err) {
    return { name: 'Unknown', isBot: false };
  }
}

/**
 * For OUTGOING messages, getSender() returns YOU, not the other party — so
 * in-chat commands need this instead to know which chat/person they're
 * actually affecting, for the confirmation message.
 */
async function getChatName(client, message) {
  try {
    const entity = await client.getEntity(message.peerId);
    return entity?.title || entity?.firstName || entity?.username || 'this chat';
  } catch (err) {
    return 'this chat';
  }
}

/**
 * Sends a short confirmation directly in the chat where you typed a command,
 * then deletes it a few seconds later — visible to you in that moment
 * (useful feedback), gone before it clutters the conversation.
 */
async function ephemeralSelfNotice(client, message, text) {
  try {
    const sent = await client.sendMessage(message.peerId, { message: text });
    setTimeout(() => {
      client.deleteMessages(message.peerId, [sent.id], { revoke: true }).catch(() => {});
    }, 4000);
  } catch (err) {
    console.error('Failed to send ephemeral self-notice:', err.message);
  }
}

async function getRecentHistory(client, message, limit = 10) {
  try {
    const messages = await client.getMessages(message.peerId, { limit });
    return messages
      .filter((m) => m.message)
      .reverse()
      .map((m) => ({ fromMe: m.out, text: m.message }));
  } catch (err) {
    return [];
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { createMessageHandler };

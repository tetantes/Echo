const { Api } = require('telegram');

/**
 * These are ALWAYS manually triggered from the control panel — never run
 * automatically in the background. Automated interaction with other bots
 * (unattended) is exactly the kind of userbot behavior Telegram's automation
 * rules are strictest about, so this stays a deliberate, one-off action you
 * ask for each time, not something Echo decides to do on its own.
 */

async function sendMessageToBot(client, botUsernameOrId, text) {
  const entity = await client.getEntity(botUsernameOrId);
  return client.sendMessage(entity, { message: text });
}

/**
 * Finds the most recent message from a bot and clicks the first button whose
 * label contains `buttonTextMatch` (case-insensitive). Returns the bot's
 * response text if it's a callback button, or the raw URL if it's a link button
 * (link buttons can't be "clicked" server-side — you have to open them yourself).
 */
async function clickButtonOnLastMessage(client, botUsernameOrId, buttonTextMatch) {
  const entity = await client.getEntity(botUsernameOrId);
  const messages = await client.getMessages(entity, { limit: 10 });

  const messageWithButtons = messages.find((m) => m.replyMarkup && m.replyMarkup.rows?.length);
  if (!messageWithButtons) {
    return { success: false, reason: 'No recent message with buttons found from that bot.' };
  }

  let targetButton = null;
  for (const row of messageWithButtons.replyMarkup.rows) {
    for (const button of row.buttons) {
      if (button.text.toLowerCase().includes(buttonTextMatch.toLowerCase())) {
        targetButton = button;
        break;
      }
    }
    if (targetButton) break;
  }

  if (!targetButton) {
    return { success: false, reason: `No button matching "${buttonTextMatch}" found on that message.` };
  }

  if (targetButton.url) {
    return { success: true, type: 'url', url: targetButton.url };
  }

  if (targetButton.data) {
    const result = await client.invoke(
      new Api.messages.GetBotCallbackAnswer({
        peer: entity,
        msgId: messageWithButtons.id,
        data: targetButton.data
      })
    );
    return { success: true, type: 'callback', message: result.message || '(no response text)' };
  }

  return { success: false, reason: 'Button type not supported (not a URL or callback button).' };
}

module.exports = { sendMessageToBot, clickButtonOnLastMessage };

function mainPanelKeyboard(settings) {
  const modeLabels = { auto: '🟢 Auto-Pilot', draft: '🟡 Draft', sleep: '🌙 Sleep Hours', silent: '🔴 Silent' };
  return {
    inline_keyboard: [
      [{ text: `🎚️ Mode: ${modeLabels[settings.mode] || settings.mode}`, callback_data: 'panel:mode' }],
      [{ text: '🌐 Chat Types', callback_data: 'panel:chattypes' }, { text: '🔇 Muted Chats', callback_data: 'panel:mutedchats' }],
      [{ text: `🏷️ Signature: ${settings.signature_enabled === 'true' ? 'On' : 'Off'}`, callback_data: 'panel:signature:toggle' },
       { text: `🌐 Force English: ${settings.force_english_replies === 'true' ? 'On' : 'Off'}`, callback_data: 'panel:forceenglish:toggle' }],
      [{ text: '🌙 Sleep Hours', callback_data: 'panel:sleephours' }],
      [{ text: '🔑 Keywords', callback_data: 'panel:keywords' }, { text: '🧠 Know Me', callback_data: 'panel:knowme' }],
      [{ text: '📢 Post to Channel', callback_data: 'panel:postchannel' }, { text: '🤖 Bot Actions', callback_data: 'panel:botactions' }],
      [{ text: '✍️ Rewrite', callback_data: 'panel:rewrite' }, { text: '📋 Activity', callback_data: 'panel:activity' }],
      [{ text: '🔑 Gemini Key', callback_data: 'panel:geminikey' }, { text: '🛡️ Safety Status', callback_data: 'panel:safety' }]
    ]
  };
}

function backToPanelKeyboard() {
  return { inline_keyboard: [[{ text: '⬅️ Back to Panel', callback_data: 'panel:main' }]] };
}

function modeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🟢 Auto-Pilot', callback_data: 'panel:mode:set:auto' }],
      [{ text: '🟡 Draft Mode', callback_data: 'panel:mode:set:draft' }],
      [{ text: '🌙 Sleep Hours Only', callback_data: 'panel:mode:set:sleep' }],
      [{ text: '🔴 Silent', callback_data: 'panel:mode:set:silent' }],
      [{ text: '⬅️ Back', callback_data: 'panel:main' }]
    ]
  };
}

function chatTypesKeyboard(settings) {
  return {
    inline_keyboard: [
      [{ text: `👤 Private DMs: ${settings.dm_enabled === 'true' ? 'On' : 'Off'}`, callback_data: 'panel:chattypes:dm:toggle' }],
      [{ text: `👥 Groups: ${settings.groups_enabled === 'true' ? 'On' : 'Off'}`, callback_data: 'panel:chattypes:groups:toggle' }],
      [{ text: `🔔 Mention/Reply Only: ${settings.group_mention_only === 'true' ? 'On' : 'Off'}`, callback_data: 'panel:chattypes:mentiononly:toggle' }],
      [{ text: `🤖 Bot DMs: ${settings.bot_dms_enabled === 'true' ? 'On' : 'Off'}`, callback_data: 'panel:chattypes:bots:toggle' }],
      [{ text: '⬅️ Back', callback_data: 'panel:main' }]
    ]
  };
}

function mutedChatsKeyboard(mutedChats) {
  const rows = [];
  mutedChats.forEach((c) => {
    if (c.ai_disabled) {
      rows.push([{ text: `🔊 Unmute AI: ${c.peer_name || c.peer_id}`, callback_data: `panel:mutedchats:unmuteai:${c.peer_id}` }]);
    }
    if (c.keywords_disabled) {
      rows.push([{ text: `🔊 Unmute Keywords: ${c.peer_name || c.peer_id}`, callback_data: `panel:mutedchats:unmutekw:${c.peer_id}` }]);
    }
  });
  rows.push([{ text: '⬅️ Back', callback_data: 'panel:main' }]);
  return { inline_keyboard: rows };
}

function keywordsKeyboard(macros) {
  const rows = macros.map((m) => [
    { text: `${m.is_active ? '🟢' : '⚪'} "${m.trigger_text}"`, callback_data: `panel:keywords:view:${m.id}` }
  ]);
  rows.push([{ text: '➕ Add Keyword', callback_data: 'panel:keywords:add' }]);
  rows.push([{ text: '⬅️ Back', callback_data: 'panel:main' }]);
  return { inline_keyboard: rows };
}

function keywordDetailKeyboard(macro) {
  return {
    inline_keyboard: [
      [{ text: macro.is_active ? '⏸ Deactivate' : '▶️ Activate', callback_data: `panel:keywords:toggle:${macro.id}` }],
      [{ text: '🗑️ Delete', callback_data: `panel:keywords:remove:${macro.id}` }],
      [{ text: '⬅️ Back', callback_data: 'panel:keywords' }]
    ]
  };
}

function botActionsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✉️ Send Message to a Bot', callback_data: 'panel:botactions:send' }],
      [{ text: '🖱️ Click a Button on a Bot Message', callback_data: 'panel:botactions:click' }],
      [{ text: '⬅️ Back', callback_data: 'panel:main' }]
    ]
  };
}

function draftActionKeyboard(draftId) {
  return {
    inline_keyboard: [[
      { text: '✅ Send', callback_data: `draft:send:${draftId}` },
      { text: '✏️ Edit', callback_data: `draft:edit:${draftId}` },
      { text: '🗑️ Discard', callback_data: `draft:discard:${draftId}` }
    ]]
  };
}

function cancelKeyboard(target = 'panel:main') {
  return { inline_keyboard: [[{ text: '❌ Cancel', callback_data: target }]] };
}

module.exports = {
  mainPanelKeyboard,
  backToPanelKeyboard,
  modeKeyboard,
  chatTypesKeyboard,
  mutedChatsKeyboard,
  keywordsKeyboard,
  keywordDetailKeyboard,
  botActionsKeyboard,
  draftActionKeyboard,
  cancelKeyboard
};

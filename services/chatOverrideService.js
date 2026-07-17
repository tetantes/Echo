const { query, queryOne } = require('../config/database');

async function getOverride(peerId) {
  return queryOne('SELECT * FROM chat_overrides WHERE peer_id = $1', [peerId]);
}

async function isAiDisabled(peerId) {
  const row = await getOverride(peerId);
  return !!(row && row.ai_disabled);
}

async function isKeywordsDisabled(peerId) {
  const row = await getOverride(peerId);
  return !!(row && row.keywords_disabled);
}

async function setAiOverride(peerId, peerName, disabled) {
  await query(
    `INSERT INTO chat_overrides (peer_id, peer_name, ai_disabled, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (peer_id) DO UPDATE SET ai_disabled = $3, peer_name = COALESCE($2, chat_overrides.peer_name), updated_at = NOW()`,
    [peerId, peerName, disabled]
  );
}

async function setKeywordsOverride(peerId, peerName, disabled) {
  await query(
    `INSERT INTO chat_overrides (peer_id, peer_name, keywords_disabled, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (peer_id) DO UPDATE SET keywords_disabled = $3, peer_name = COALESCE($2, chat_overrides.peer_name), updated_at = NOW()`,
    [peerId, peerName, disabled]
  );
}

async function listMuted() {
  // Anything with EITHER override active — the panel screen shows both together, labeled.
  return query('SELECT * FROM chat_overrides WHERE ai_disabled = true OR keywords_disabled = true ORDER BY updated_at DESC');
}

async function clearOverride(peerId) {
  await query('DELETE FROM chat_overrides WHERE peer_id = $1', [peerId]);
}

module.exports = {
  getOverride,
  isAiDisabled,
  isKeywordsDisabled,
  setAiOverride,
  setKeywordsOverride,
  listMuted,
  clearOverride
};

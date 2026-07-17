const { query, queryOne } = require('../config/database');

async function list() {
  return query('SELECT * FROM keyword_macros ORDER BY id ASC');
}

async function add(triggerText, responseText, matchType = 'contains') {
  return queryOne(
    `INSERT INTO keyword_macros (trigger_text, response_text, match_type) VALUES ($1, $2, $3) RETURNING *`,
    [triggerText, responseText, matchType]
  );
}

async function remove(id) {
  await query('DELETE FROM keyword_macros WHERE id = $1', [id]);
}

async function toggle(id) {
  await query('UPDATE keyword_macros SET is_active = NOT is_active WHERE id = $1', [id]);
}

/**
 * Check an incoming message against all active macros. Returns the FIRST
 * matching macro (in creation order) or null. Matching is case-insensitive.
 */
async function findMatch(messageText) {
  if (!messageText) return null;
  const macros = await query('SELECT * FROM keyword_macros WHERE is_active = true ORDER BY id ASC');
  const lowerText = messageText.toLowerCase().trim();

  for (const macro of macros) {
    const trigger = macro.trigger_text.toLowerCase().trim();
    if (macro.match_type === 'exact' && lowerText === trigger) return macro;
    if (macro.match_type === 'starts_with' && lowerText.startsWith(trigger)) return macro;
    if (macro.match_type === 'contains' && lowerText.includes(trigger)) return macro;
  }
  return null;
}

module.exports = { list, add, remove, toggle, findMatch };

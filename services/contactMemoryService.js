const { query } = require('../config/database');

async function getNotesForPeer(peerId) {
  const rows = await query('SELECT note FROM contact_memory WHERE peer_id = $1 ORDER BY created_at DESC LIMIT 10', [peerId]);
  return rows.map((r) => r.note).join('\n');
}

async function addNote(peerId, peerName, note) {
  await query('INSERT INTO contact_memory (peer_id, peer_name, note) VALUES ($1, $2, $3)', [peerId, peerName, note]);
}

async function listAllPeersWithNotes() {
  return query(`
    SELECT peer_id, peer_name, COUNT(*)::int as note_count, MAX(created_at) as last_updated
    FROM contact_memory GROUP BY peer_id, peer_name ORDER BY last_updated DESC
  `);
}

module.exports = { getNotesForPeer, addNote, listAllPeersWithNotes };

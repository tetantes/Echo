const settingsService = require('./settingsService');
const { query } = require('../config/database');

// In-memory sliding windows — deliberately not persisted. These exist purely
// to catch bursty behavior *right now*; they don't need to survive a restart,
// and putting them in the DB would just add query overhead to every send.
let autoReplyTimestamps = []; // for the hourly auto-reply cap
let recentOutgoingByText = new Map(); // text -> [{ peerId, ts }] — catches identical text going to many chats fast
let recentOwnMessages = []; // { ts } — catches YOU sending in quick bursts across chats, not just Echo

const BROADCAST_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BROADCAST_DISTINCT_PEER_THRESHOLD = 3; // same text to 3+ different chats = looks like spam
const BURST_WINDOW_MS = 60 * 1000;
const BURST_MESSAGE_THRESHOLD = 15; // 15+ messages across chats in a minute = risky burst pattern

function pruneOld(arr, windowMs) {
  const cutoff = Date.now() - windowMs;
  return arr.filter((t) => t.ts >= cutoff);
}

/**
 * Call before Echo sends an automated reply. Returns { allowed, reason }.
 */
async function canSendAutoReply() {
  const maxPerHour = await settingsService.getNumber('max_replies_per_hour', 20);
  autoReplyTimestamps = pruneOld(autoReplyTimestamps.map((ts) => ({ ts })), 60 * 60 * 1000).map((o) => o.ts);

  if (autoReplyTimestamps.length >= maxPerHour) {
    return { allowed: false, reason: `Hourly auto-reply cap reached (${maxPerHour}/hour). Pausing to stay safe.` };
  }
  return { allowed: true };
}

function recordAutoReply() {
  autoReplyTimestamps.push(Date.now());
}

/**
 * Call before Echo sends any text (auto-reply OR keyword macro) to check if
 * this exact text has recently gone to several different chats — the classic
 * pattern Telegram's anti-spam systems flag as bulk/broadcast behavior.
 */
function checkBroadcastPattern(text, peerId) {
  const key = (text || '').trim().toLowerCase();
  if (!key) return { risky: false };

  let entries = recentOutgoingByText.get(key) || [];
  entries = entries.filter((e) => Date.now() - e.ts < BROADCAST_WINDOW_MS);

  const distinctPeers = new Set(entries.map((e) => e.peerId));
  distinctPeers.add(peerId);

  entries.push({ peerId, ts: Date.now() });
  recentOutgoingByText.set(key, entries);

  if (distinctPeers.size >= BROADCAST_DISTINCT_PEER_THRESHOLD) {
    return { risky: true, reason: `Same message about to go to ${distinctPeers.size} different chats within 5 minutes — this is a strong spam signal to Telegram.` };
  }
  return { risky: false };
}

/**
 * Call on EVERY outgoing message from your account (manual or automated) to
 * watch for rapid-fire bursts across many chats — another common trigger for
 * Telegram's automated restrictions, independent of message content.
 */
function recordOwnMessageAndCheckBurst() {
  recentOwnMessages.push({ ts: Date.now() });
  recentOwnMessages = pruneOld(recentOwnMessages, BURST_WINDOW_MS);

  if (recentOwnMessages.length >= BURST_MESSAGE_THRESHOLD) {
    return { risky: true, reason: `${recentOwnMessages.length} messages sent in the last minute — that's a burst pattern Telegram's systems watch for. Consider slowing down.` };
  }
  return { risky: false };
}

async function logActivity(peerId, peerName, eventType, detail) {
  await query(
    `INSERT INTO activity_log (peer_id, peer_name, event_type, detail) VALUES ($1, $2, $3, $4)`,
    [peerId, peerName || null, eventType, detail || null]
  );
}

async function getRecentSafetyEvents(limit = 10) {
  return query(
    `SELECT * FROM activity_log WHERE event_type IN ('safety_block', 'burst_warning', 'broadcast_warning')
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
}

module.exports = {
  canSendAutoReply,
  recordAutoReply,
  checkBroadcastPattern,
  recordOwnMessageAndCheckBurst,
  logActivity,
  getRecentSafetyEvents
};

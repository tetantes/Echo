/**
 * Prevents the same recurring error (e.g. a broken Gemini model/key) from
 * notifying you once per incoming message. Without this, a single ongoing
 * problem turns into a notification spam storm since every message that
 * would've triggered an AI reply hits the same failure.
 */

const lastNotifiedAt = new Map(); // errorKey -> timestamp
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/**
 * @param errorKey a stable identifier for the error (e.g. first 60 chars of the message)
 * @param cooldownMs how long to stay silent after notifying once for this key
 * @returns {boolean} true if you should notify now, false if it was already
 *   reported recently and should just be logged silently instead.
 */
function shouldNotify(errorKey, cooldownMs = DEFAULT_COOLDOWN_MS) {
  const last = lastNotifiedAt.get(errorKey);
  if (last && Date.now() - last < cooldownMs) return false;
  lastNotifiedAt.set(errorKey, Date.now());
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // clear anything older than an hour
  for (const [key, ts] of lastNotifiedAt.entries()) {
    if (ts < cutoff) lastNotifiedAt.delete(key);
  }
}, 30 * 60 * 1000);

module.exports = { shouldNotify };

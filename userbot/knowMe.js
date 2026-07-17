const { query } = require('../config/database');
const geminiService = require('../services/geminiService');

const MAX_DIALOGS_TO_SCAN = 15;
const MESSAGES_PER_DIALOG = 20;
const MAX_SAMPLES = 150;

/**
 * Scans your recent chats, pulls YOUR OWN outgoing text messages (never the
 * other person's), and asks Gemini to summarize how you write. Re-run this
 * any time — it always overwrites the previous profile with a fresh one.
 */
async function buildProfile(client, onProgress) {
  const dialogs = await client.getDialogs({ limit: MAX_DIALOGS_TO_SCAN * 3 }); // over-fetch since we'll filter most out
  const samples = [];

  for (const dialog of dialogs) {
    if (samples.length >= MAX_SAMPLES) break;

    // Only real 1-on-1 conversations with actual people count toward your
    // voice — group chats often have a different, more performative register,
    // and bot chats are just commands, neither reflects how you actually talk.
    const isPrivateHumanDM = dialog.isUser && !dialog.entity?.bot;
    if (!isPrivateHumanDM) continue;

    try {
      const messages = await client.getMessages(dialog.id, { limit: MESSAGES_PER_DIALOG });
      for (const msg of messages) {
        if (msg.out && msg.message && msg.message.trim().length > 0) {
          samples.push(msg.message.trim());
        }
      }
    } catch (err) {
      continue;
    }
    if (onProgress) onProgress(samples.length);
  }

  if (samples.length < 10) {
    return { success: false, reason: `Only found ${samples.length} of your own messages — need at least 10 to build a useful profile. Chat a bit more first.` };
  }

  const profileText = await geminiService.buildVoiceProfile(samples.slice(0, MAX_SAMPLES));

  await query(
    `INSERT INTO voice_profile (id, profile_text, sample_count, updated_at) VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET profile_text = $1, sample_count = $2, updated_at = NOW()`,
    [profileText, samples.length]
  );

  return { success: true, sampleCount: samples.length, profileText };
}

async function getProfile() {
  const rows = await query('SELECT * FROM voice_profile WHERE id = 1');
  return rows[0] || null;
}

module.exports = { buildProfile, getProfile };

const { GoogleGenerativeAI } = require('@google/generative-ai');
const settingsService = require('./settingsService');

/**
 * Builds a fresh client each call since the API key is user-configurable via
 * the panel and can change at runtime — cheap enough to not bother caching.
 */
async function getModel() {
  const apiKey = await settingsService.get('gemini_api_key', '') || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key set. Set one from the panel (🔑 Gemini Key).');

  const modelName = await settingsService.get('gemini_model', 'gemini-3.1-flash-lite');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });
}

const SYSTEM_INSTRUCTIONS = `
You are drafting a reply on behalf of a real person, in their own voice, inside their personal Telegram account.

You will be given:
- Their voice profile (how they typically write)
- Recent conversation history with this specific contact
- Any known facts about this contact
- The new incoming message

Rules, in order of importance:
1. NEVER invent facts, commitments, plans, or numbers that are not clearly supported by the given context.
2. If the message involves money, payment, sending funds, account/password/verification codes, or anything that
   sounds urgent, upset, or emotionally charged — do NOT reply. Set should_reply to false.
3. If you are not reasonably confident the reply is what this person would actually say, do NOT guess —
   set should_reply to false rather than send something generic or wrong.
4. Keep replies short and in the person's actual voice/style — do not sound like a generic AI assistant.
5. Never claim to be human if directly and sincerely asked whether you are a bot/AI — but you also don't need
   to volunteer it unprompted for an ordinary reply.

Respond ONLY with JSON in this exact shape, nothing else:
{"should_reply": boolean, "reply": string, "confidence": "high" | "medium" | "low", "reason": string}

"reason" should briefly explain your decision either way (e.g. "confirmed plan already discussed" or
"message requests money, escalating instead").
`.trim();

/**
 * @param {object} ctx
 * @param {string} ctx.voiceProfile
 * @param {string} ctx.contactNotes
 * @param {Array<{fromMe: boolean, text: string}>} ctx.history
 * @param {string} ctx.incomingText
 * @returns {Promise<{should_reply: boolean, reply: string, confidence: string, reason: string}>}
 */
async function generateReply(ctx) {
  const model = await getModel();

  const historyText = (ctx.history || [])
    .map((m) => `${m.fromMe ? 'Them (me)' : 'Contact'}: ${m.text}`)
    .join('\n');

  const forceEnglish = await settingsService.getBool('force_english_replies', true);
  const languageInstruction = forceEnglish
    ? `\nIMPORTANT: Regardless of what language, dialect, or slang the voice profile describes or the incoming message uses, ALWAYS write the reply in standard English. Keep the profile's tone/length/emoji habits, but not its language choice.\n`
    : '';

  const prompt =
    `${SYSTEM_INSTRUCTIONS}\n` +
    languageInstruction + `\n` +
    `VOICE PROFILE:\n${ctx.voiceProfile || '(none built yet — be neutral and brief)'}\n\n` +
    `KNOWN FACTS ABOUT THIS CONTACT:\n${ctx.contactNotes || '(none)'}\n\n` +
    `RECENT HISTORY:\n${historyText || '(no prior history)'}\n\n` +
    `NEW INCOMING MESSAGE:\n${ctx.incomingText}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();

  try {
    const parsed = JSON.parse(raw);
    return {
      should_reply: !!parsed.should_reply,
      reply: String(parsed.reply || ''),
      confidence: parsed.confidence || 'low',
      reason: parsed.reason || ''
    };
  } catch (err) {
    console.error('Failed to parse Gemini response as JSON:', raw);
    return { should_reply: false, reply: '', confidence: 'low', reason: 'Failed to parse model response — skipping to be safe.' };
  }
}

/**
 * Translates arbitrary text into English. Used both by the ".tr" in-chat
 * command (translates the last incoming message in that chat) and by typing
 * "translate <text>" directly to the panel bot.
 */
async function translateToEnglish(text) {
  const model = await getModel();
  const prompt =
    `Translate the following text into natural, fluent English. If it's already in English, just say so plainly. ` +
    `Also briefly name the detected source language.\n\n` +
    `TEXT:\n${text}\n\n` +
    `Respond ONLY with JSON: {"detected_language": string, "translation": string}`;

  const result = await model.generateContent(prompt);
  try {
    return JSON.parse(result.response.text());
  } catch (err) {
    console.error('Failed to parse translation response:', result.response.text());
    return { detected_language: 'unknown', translation: text };
  }
}

/**
 * Builds/refreshes the voice profile from a batch of the user's own recent
 * outgoing messages (sampled across chats by userbot/knowMe.js).
 */
async function buildVoiceProfile(sampleMessages) {
  const model = await getModel();
  const prompt =
    `Below are real messages a person has sent on Telegram, across different conversations. ` +
    `Write a short (4-6 sentence) style profile describing HOW they write: message length, tone, ` +
    `emoji usage, formality, common phrases or verbal tics. This will be used to help draft replies ` +
    `in their voice. Do not summarize WHAT they talked about, only HOW they write.\n\n` +
    `MESSAGES:\n${sampleMessages.join('\n---\n')}\n\n` +
    `Respond ONLY with JSON: {"profile": string}`;

  const result = await model.generateContent(prompt);
  try {
    const parsed = JSON.parse(result.response.text());
    return parsed.profile || '';
  } catch (err) {
    console.error('Failed to parse voice profile response:', result.response.text());
    return '';
  }
}

/**
 * Rewrite a piece of text in 2-3 styles for the user to pick from manually.
 */
async function rewriteText(text, voiceProfile) {
  const model = await getModel();
  const prompt =
    `Rewrite the following message in 3 variants: "formal", "casual", and "shorter". ` +
    `Keep the original meaning exactly. Use this voice profile as a loose guide for tone: ${voiceProfile || '(none)'}\n\n` +
    `ORIGINAL:\n${text}\n\n` +
    `Respond ONLY with JSON: {"formal": string, "casual": string, "shorter": string}`;

  const result = await model.generateContent(prompt);
  try {
    return JSON.parse(result.response.text());
  } catch (err) {
    console.error('Failed to parse rewrite response:', result.response.text());
    return { formal: text, casual: text, shorter: text };
  }
}

module.exports = { generateReply, buildVoiceProfile, rewriteText, translateToEnglish };

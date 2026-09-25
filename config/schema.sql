-- ==================== ECHO SCHEMA ====================

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Deterministic canned-response macros: if an incoming message matches
-- `trigger_text` (per match_type), Echo sends `response_text` directly —
-- no AI call, no confidence gate, just an instant fixed reply.
CREATE TABLE IF NOT EXISTS keyword_macros (
    id SERIAL PRIMARY KEY,
    trigger_text VARCHAR(255) NOT NULL,
    response_text TEXT NOT NULL,
    match_type VARCHAR(20) DEFAULT 'contains', -- 'contains' | 'exact' | 'starts_with'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Small recurring facts about specific contacts, built by "Know Me" and
-- usable by hand too. Keeps AI replies from being context-blind.
CREATE TABLE IF NOT EXISTS contact_memory (
    id SERIAL PRIMARY KEY,
    peer_id BIGINT NOT NULL,
    peer_name VARCHAR(255),
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Your voice profile, rebuilt each time you tap "Know Me". Single row,
-- always overwritten — we only need the latest snapshot.
CREATE TABLE IF NOT EXISTS voice_profile (
    id INT PRIMARY KEY DEFAULT 1,
    profile_text TEXT,
    sample_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Every auto-reply, flag, keyword match, or skip gets logged here so the
-- morning digest (and 🛡️ Safety Status) has something to summarize.
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    peer_id BIGINT,
    peer_name VARCHAR(255),
    event_type VARCHAR(30), -- 'auto_reply', 'draft', 'flagged', 'keyword_match', 'skipped_low_confidence', 'safety_block'
    detail TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Per-chat override: lets you disable AI-drafted replies AND/OR keyword
-- macros in one specific conversation independently. Toggled by typing
-- ".ai off/on" and ".kw off/on" directly in that chat — see
-- userbot/messageHandler.js.
CREATE TABLE IF NOT EXISTS chat_overrides (
    peer_id BIGINT PRIMARY KEY,
    peer_name VARCHAR(255),
    ai_disabled BOOLEAN DEFAULT false,
    keywords_disabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
('mode', 'draft'),                  -- 'auto' | 'draft' | 'sleep' | 'silent'
('dm_enabled', 'true'),             -- private DMs with real people
('groups_enabled', 'false'),        -- groups & channels
('bot_dms_enabled', 'false'),       -- DMs from OTHER bots (separate from human DMs)
('group_mention_only', 'true'),     -- in groups, only engage when @mentioned or replied to
('force_english_replies', 'true'),  -- always reply in English regardless of the voice profile's learned dialect/slang
('signature_enabled', 'true'),
('sleep_start_hour', '23'),
('sleep_end_hour', '7'),
('gemini_api_key', ''),
('gemini_model', 'gemini-3.1-flash-lite'),
('max_replies_per_hour', '20')      -- safety valve, see services/safetyService.js
ON CONFLICT (key) DO NOTHING;

-- One-time correction: gemini-2.5-flash-lite was retired for new API users.
-- Only overwrites if you're still on that old broken value — leaves any
-- model you've deliberately changed to since alone.
UPDATE settings SET value = 'gemini-3.1-flash-lite'
WHERE key = 'gemini_model' AND value = 'gemini-2.5-flash-lite';

-- One-time migration for chat_overrides if it already exists without the new column.
ALTER TABLE chat_overrides ADD COLUMN IF NOT EXISTS keywords_disabled BOOLEAN DEFAULT false;

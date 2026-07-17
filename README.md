# Echo

An AI-assisted layer for your *personal* Telegram account — not a bot account.
It watches your real DMs (and optionally groups), and can draft or auto-send
replies in your voice when you're away, using Gemini.

## Important — read this first

**This automates your real Telegram account**, using your own login session
(MTProto/GramJS), not a bot token. That's what makes things like reading your
full chat history and recovering deleted messages possible — a bot account
can't do either. It also means Telegram's automation rules for *personal
accounts* apply here: light personal automation (drafting/auto-replying to
your own DMs) is common and low-risk, but anything that looks like bulk/spam
behavior can get your real account limited. Echo's safety layer
(`services/safetyService.js`) exists specifically to catch that before it
happens — start in **Draft Mode**, not Auto-Pilot, until you trust it.

**Why the control panel isn't literally inside Saved Messages:** Telegram
does not allow personal accounts to attach tappable inline buttons to their
own messages — that's bot-only. So the panel lives in a DM with a small,
free, second bot (`PANEL_BOT_TOKEN`, made via @BotFather) that only ever
talks to you. Your real account (the userbot) does all the actual reading,
replying, and watching.

**Deleted-message recovery has a hard limit:** Telegram's delete event never
includes the original content — only message IDs. Echo can only "recover" a
deleted message if it was already running and had cached that message before
it got deleted. It cannot reach back to anything deleted before Echo started,
or while the process was down. That's a platform limitation, not a bug.

## Setup

### 1. Get your Telegram API credentials
Go to https://my.telegram.org → API Development Tools → create an app.
You'll get `TG_API_ID` and `TG_API_HASH`.

### 2. Create the control panel bot
Message @BotFather → `/newbot` → name it something like "EchoControlBot".
Copy the token into `PANEL_BOT_TOKEN`.

### 3. Get your own numeric Telegram ID
Message @userinfobot. Put it in `OWNER_TELEGRAM_ID`.

### 4. Install and log in
```bash
npm install
cp .env.example .env
# fill in TG_API_ID, TG_API_HASH, PANEL_BOT_TOKEN, OWNER_TELEGRAM_ID, DATABASE_URL
npm run login
```
`npm run login` is **interactive** — it'll ask for your phone number, the
code Telegram texts you, and your 2FA password if you have one. At the end
it prints a session string. **Copy that into `TG_SESSION_STRING` in `.env`.**
This must be done once, locally (e.g. in Termux) — you can't do this
non-interactively on a host like Render.

### 5. Migrate the database
```bash
npm run migrate
```

### 6. Set your Gemini key
Either put it in `.env` as `GEMINI_API_KEY`, or (better) start the bot and
set it from the control panel's 🔑 Gemini Key button instead — that way it's
not sitting in plaintext host env vars. Get a free key at
https://aistudio.google.com/apikey.

### 7. Run it
```bash
npm start
```
Then message your control panel bot with `/panel`.

## Deploying

Same shape as your other bots: push to GitHub, deploy on Render as a Web
Service, `npm install` build command, `npm start` start command, add all the
`.env` vars (including the session string) in Render's Environment tab, ping
`/health` from cron-job.org to keep the free tier awake.

**One difference from a normal bot deploy:** you generate `TG_SESSION_STRING`
locally first (step 4 above) — Render can't do the interactive phone/code
login for you.

## What each mode actually does

| Mode | Behavior |
|---|---|
| 🟢 Auto-Pilot | Confident replies get sent immediately, in your voice |
| 🟡 Draft | Nothing is ever sent automatically — every reply becomes a message in your panel bot with Send/Edit/Discard buttons |
| 🌙 Sleep Hours | Behaves like Auto-Pilot, but only inside your configured hour window; silent outside it |
| 🔴 Silent | Logs everything to Activity, replies to nothing |

## Chat Types — three independent toggles

Instead of one "public/private" switch, 🌐 Chat Types in the panel gives you
three separate on/off toggles:
- 👤 **Private DMs** — real people messaging you directly
- 👥 **Groups** — any group or channel
- 🤖 **Bot DMs** — other bots messaging you (kept separate from real people,
  since these are usually automated notifications, not conversations)

## Muting AI or Keywords in one specific chat

Type directly into any chat (as yourself):
```
.ai off       — mute AI-drafted/auto replies in THIS chat only
.ai on        — re-enable it
.ai status    — check current state (shows briefly, self-deletes)

.kw off       — mute keyword macros in THIS chat only
.kw on        — re-enable them
.kw status    — check current state
```
These are fully independent — you can have AI off but keywords still firing
in one chat, or vice versa. Your own command message is deleted
automatically so the other person never sees it. Manage everything muted
from 🔇 Muted Chats in the panel.

**Keyword macros bypass mode entirely** — they fire even in 🔴 Silent mode or
outside your 🌙 Sleep Hours window, since a canned response is deterministic
and low-risk regardless of what mode AI replies are in. The only thing that
stops a keyword macro is ".kw off" in that specific chat.

## Translating a message

```
.tr           — (typed in any chat, as yourself) translates the most recent
                message THEY sent in that chat, sends you the result
                privately via the panel bot — never posted in the real chat
```
Or, directly to the panel bot itself, for any arbitrary text:
```
translate <text>
```

## Groups — mention/reply only by default

🌐 Chat Types has a **Mention/Reply Only** toggle (on by default). When on,
Echo only engages with a group message if it actually @mentions you or
replies to something you sent — not every line of group chatter. Turn it
off if you want full coverage of every message in enabled groups instead.

**Bot senders in groups are always ignored — not a setting.** Two bots able
to reply to each other in a shared group is a real risk (loops, spam-looking
behavior) with no legitimate upside, so this is a hard rule rather than a
toggle. Bot DMs (a bot messaging you one-on-one) remain separately
toggleable in Chat Types, since that's a deliberate situation you might
actually want.

## Force English

🌐 Force English (on by default, toggle on the main panel) makes every
AI-drafted reply written in standard English regardless of what language or
dialect your 🧠 Know Me voice profile picked up from your actual chats. The
profile still informs tone, length, and emoji habits — just not the
language itself. Turn it off if you actually want Echo replying in whatever
language/dialect your profile detected.

## Know Me

Only samples your own messages from real 1-on-1 DMs with actual people —
group chats (different, more performative register) and bot chats (just
commands, not real conversation) are excluded, so the profile reflects how
you actually talk to people, not how you talk in a group or to a bot. You
can view the current profile anytime without rebuilding it — 🧠 Know Me now
shows what's stored, with a separate button to rebuild fresh.

## The confidence gate

Every AI-drafted reply goes through Gemini with an instruction to refuse to
answer (`should_reply: false`) rather than guess, whenever:
- the message involves money, payment, codes, or verification
- it reads as urgent, upset, or emotionally charged
- the model isn't confident the reply matches what you'd actually say

When it declines, you get a 🚩 flag in the panel bot instead — nothing is
silently missed, it's just handed back to you.

## Project structure

```
index.js                  — entry point, wires the userbot client + panel bot together
session/login.js          — one-time interactive login (run locally, not on a host)
userbot/
  client.js                — GramJS client factory
  clientRegistry.js         — lets panel handlers reach the live client without circular requires
  messageHandler.js         — the core: scope/mode gating → keyword macros → AI confidence gate → safety checks → send
  deletedMessageHandler.js  — recovers cached messages that get deleted shortly after arriving
  messageCache.js           — short-lived in-memory cache backing the above
  knowMe.js                 — builds your voice profile from your own recent messages
  botActions.js             — manual (never automatic) send-to-bot / click-button actions
services/
  settingsService.js, keywordService.js, geminiService.js, contactMemoryService.js, safetyService.js
panel/
  panelBot.js                — the control panel bot entry point
  draftStore.js               — in-memory pending-draft storage for Draft Mode approvals
  handlers/                   — one file per panel screen, same router pattern as your other bots
```

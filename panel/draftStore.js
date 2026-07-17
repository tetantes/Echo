/**
 * Holds drafts awaiting your approval (Draft Mode). In-memory only — if the
 * process restarts with unapproved drafts pending, they're lost, which is an
 * acceptable tradeoff (nothing was sent yet, so nothing is silently missed
 * except the draft itself; the original incoming message is still in Telegram).
 */

const store = new Map();
let counter = 0;
const TTL_MS = 60 * 60 * 1000; // 1 hour

function save(draft) {
  const id = String(++counter);
  store.set(id, { ...draft, createdAt: Date.now() });
  return id;
}

function get(id) {
  const draft = store.get(id);
  if (!draft) return null;
  if (Date.now() - draft.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return draft;
}

function update(id, patch) {
  const draft = get(id);
  if (!draft) return null;
  const updated = { ...draft, ...patch };
  store.set(id, updated);
  return updated;
}

function remove(id) {
  store.delete(id);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, draft] of store.entries()) {
    if (now - draft.createdAt > TTL_MS) store.delete(id);
  }
}, 15 * 60 * 1000);

module.exports = { save, get, update, remove };

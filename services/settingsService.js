const { query } = require('../config/database');

let cache = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 15 * 1000;

async function loadAll() {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const rows = await query('SELECT key, value FROM settings');
  cache = {};
  for (const row of rows) cache[row.key] = row.value;
  cacheLoadedAt = Date.now();
  return cache;
}

async function get(key, fallback = null) {
  const all = await loadAll();
  return all[key] !== undefined ? all[key] : fallback;
}

async function getBool(key, fallback = false) {
  const val = await get(key);
  if (val === null) return fallback;
  return val === 'true';
}

async function getNumber(key, fallback = 0) {
  const val = await get(key);
  const num = Number(val);
  return Number.isNaN(num) ? fallback : num;
}

async function getAll() {
  return loadAll();
}

async function set(key, value) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, String(value)]
  );
  cache = null;
}

module.exports = { get, getBool, getNumber, getAll, set };

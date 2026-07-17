const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => console.error('Unexpected PG pool error:', err));

async function query(text, params) {
  try {
    const res = await pool.query(text, params);
    return res.rows;
  } catch (err) {
    console.error('DB query error:', err.message, '\nQuery:', text);
    throw err;
  }
}

async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

module.exports = { pool, query, queryOne };

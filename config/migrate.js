const fs = require('fs');
const path = require('path');
const { pool } = require('./database');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Applying schema.sql ...');
  await pool.query(sql);
  console.log('✅ Schema applied successfully.');
  await pool.end();
}

migrate().catch((err) => {
  // PostgreSQL error code 53000 = insufficient_resources (quota exceeded)
  // 53100 = disk_full, 53200 = out_of_memory, 53300 = too_many_connections
  const quotaErrors = ['53000', '53100', '53200', '53300'];
  if (quotaErrors.includes(err.code)) {
    console.warn('⚠️  Migration skipped: DB quota/resource limit hit. The app will still start.');
    console.warn('   Fix: Upgrade your Render Postgres plan or free up database connections.');
    process.exit(0); // exit 0 so "node index.js" still runs
  }
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

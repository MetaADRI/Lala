require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Drop and let sync() recreate with all columns (token + codeHash)
    await client.query('DROP TABLE IF EXISTS "PasswordResetTokens"');
    console.log('Dropped PasswordResetTokens — sync() will recreate with all columns');
  } finally {
    await client.end();
  }
})().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });

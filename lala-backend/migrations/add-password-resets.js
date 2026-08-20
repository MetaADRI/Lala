require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Check if column already exists
    const col = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Users' AND column_name = 'passwordResets'
    `);
    if (col.rows.length > 0) {
      console.log('passwordResets column already exists — skipping');
      return;
    }

    await client.query(`ALTER TABLE "Users" ADD COLUMN "passwordResets" INTEGER NOT NULL DEFAULT 0`);
    console.log('Added passwordResets column (default 0)');
  } finally {
    await client.end();
  }
})().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });

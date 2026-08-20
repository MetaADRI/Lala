require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Check if column already exists
    const col = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Users' AND column_name = 'emailConfirmed'
    `);
    if (col.rows.length > 0) {
      console.log('emailConfirmed column already exists — skipping');
      return;
    }

    // Add column (defaults to false for new users)
    await client.query(`ALTER TABLE "Users" ADD COLUMN "emailConfirmed" BOOLEAN NOT NULL DEFAULT false`);
    console.log('Added emailConfirmed column');

    // Backfill: all existing users are retroactively confirmed
    const res = await client.query(`UPDATE "Users" SET "emailConfirmed" = true`);
    console.log('Backfilled ' + res.rowCount + ' existing user(s) as confirmed');
  } finally {
    await client.end();
  }
})().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });

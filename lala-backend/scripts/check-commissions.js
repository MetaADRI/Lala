// scripts/check-commissions.js — inspect live commission settlement state
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
});

async function main() {
  await sequelize.authenticate();
  console.log('Connected to DB\n');

  // Confirm commission columns exist
  const [cols] = await sequelize.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'Bookings'
    ORDER BY column_name
  `);
  const names = cols.map((c) => c.column_name);
  console.log('Settlement columns present:');
  for (const c of [
    'lodgeStatus', 'lodgeRef', 'lodgePayoutAmount',
    'commissionStatus', 'commissionAmount', 'commissionRef',
  ]) {
    console.log(`  ${c}: ${names.includes(c) ? 'YES' : 'MISSING'}`);
  }

  const [rows] = await sequelize.query(`
    SELECT id, status, "paymentStatus", provider, "totalAmount",
           "lodgeStatus", "lodgePayoutAmount", "lodgeRef",
           "commissionStatus", "commissionAmount", "commissionRef",
           "createdAt"
    FROM "Bookings"
    ORDER BY "createdAt" DESC
    LIMIT 20
  `);

  console.log(`\nRecent bookings (${rows.length}):\n`);
  for (const r of rows) {
    console.log({
      id: String(r.id).slice(0, 8),
      status: r.status,
      payment: r.paymentStatus,
      provider: r.provider,
      total: r.totalAmount,
      lodge: r.lodgeStatus,
      lodgeAmt: r.lodgePayoutAmount,
      lodgeRef: r.lodgeRef ? String(r.lodgeRef).slice(0, 24) : null,
      commission: r.commissionStatus,
      commAmt: r.commissionAmount,
      commRef: r.commissionRef ? String(r.commissionRef).slice(0, 24) : null,
      at: r.createdAt,
    });
  }

  const [stats] = await sequelize.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      COUNT(*) FILTER (WHERE "paymentStatus" = 'successful')::int AS pay_ok,
      COUNT(*) FILTER (WHERE "commissionStatus" = 'paid')::int AS comm_paid,
      COUNT(*) FILTER (WHERE "commissionStatus" = 'failed')::int AS comm_failed,
      COUNT(*) FILTER (WHERE "commissionStatus" = 'pending')::int AS comm_pending,
      COUNT(*) FILTER (WHERE "commissionStatus" = 'skipped')::int AS comm_skipped,
      COUNT(*) FILTER (WHERE "lodgeStatus" = 'paid')::int AS lodge_paid,
      COUNT(*) FILTER (WHERE "lodgeStatus" = 'failed')::int AS lodge_failed,
      COUNT(*) FILTER (WHERE "lodgeStatus" = 'pending')::int AS lodge_pending,
      COUNT(*) FILTER (WHERE "lodgeStatus" = 'skipped')::int AS lodge_skipped
    FROM "Bookings"
  `);
  console.log('\nSTATS:', stats[0]);

  // Confirmed paid but commission not paid = the boss problem
  const [stuck] = await sequelize.query(`
    SELECT id, provider, "totalAmount", "lodgeStatus", "commissionStatus", "commissionAmount"
    FROM "Bookings"
    WHERE status = 'confirmed'
      AND "paymentStatus" = 'successful'
      AND COALESCE("commissionStatus", 'pending') <> 'paid'
    ORDER BY "createdAt" DESC
    LIMIT 20
  `);
  console.log(`\nConfirmed payments with commission NOT paid: ${stuck.length}`);
  for (const s of stuck) {
    console.log(s);
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});

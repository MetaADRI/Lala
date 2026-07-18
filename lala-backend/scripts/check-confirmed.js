require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
});

async function main() {
  await sequelize.authenticate();

  const [confirmed] = await sequelize.query(`
    SELECT *
    FROM "Bookings"
    WHERE status = 'confirmed'
    ORDER BY "createdAt" DESC
  `);
  console.log('CONFIRMED BOOKINGS:', confirmed.length);
  for (const r of confirmed) {
    console.log(JSON.stringify(r, null, 2));
  }

  // Any with any settlement activity
  const [any] = await sequelize.query(`
    SELECT id, status, "paymentStatus", provider, "totalAmount",
           "lodgeStatus", "commissionStatus", "commissionAmount", "lodgePayoutAmount"
    FROM "Bookings"
    WHERE "lodgeStatus" <> 'pending'
       OR "commissionStatus" <> 'pending'
       OR "commissionAmount" IS NOT NULL
       OR "lodgePayoutAmount" IS NOT NULL
  `);
  console.log('\nAny settlement activity rows:', any.length);
  for (const r of any) console.log(r);

  // Listings hostPhone check
  const [listings] = await sequelize.query(`
    SELECT id, name, "hostPhone", "isApproved"
    FROM "Listings"
    ORDER BY "createdAt" DESC
    LIMIT 10
  `);
  console.log('\nListings hostPhone:');
  for (const l of listings) {
    console.log({ id: String(l.id).slice(0, 8), name: l.name, hostPhone: l.hostPhone, approved: l.isApproved });
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

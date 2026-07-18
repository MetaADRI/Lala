require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
});

(async () => {
  await sequelize.authenticate();
  const [users] = await sequelize.query(`
    SELECT id, name, phone, role, email
    FROM "Users"
    WHERE role IN ('host', 'admin')
    ORDER BY "createdAt" DESC
    LIMIT 30
  `);
  console.log('HOST/ADMIN USERS:');
  console.log(users);

  const [all] = await sequelize.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      COUNT(*) FILTER (WHERE "paymentStatus" = 'successful')::int AS pay_successful,
      COUNT(*) FILTER (WHERE "paymentStatus" = 'failed')::int AS pay_failed,
      COUNT(*) FILTER (WHERE "paymentStatus" = 'pending')::int AS pay_pending,
      COUNT(*) FILTER (WHERE "commissionStatus" = 'paid')::int AS commission_paid,
      COUNT(*) FILTER (WHERE "lodgeStatus" = 'paid')::int AS lodge_paid
    FROM "Bookings"
  `);
  console.log('\nBOOKING PAYMENT SUMMARY:');
  console.log(all[0]);
  await sequelize.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

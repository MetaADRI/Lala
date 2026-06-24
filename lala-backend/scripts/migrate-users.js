const { Sequelize } = require('sequelize');
require('dotenv').config();

const sq = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: console.log
});

(async () => {
  await sq.authenticate();
  console.log('Connected');

  // Add email column (nullable for now)
  await sq.query(`ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255)`);
  console.log('email column added');

  // Add password column (nullable for now)
  await sq.query(`ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "password" VARCHAR(255)`);
  console.log('password column added');

  // Set placeholder values for existing rows
  await sq.query(
    `UPDATE "Users" SET "email" = CONCAT('user_', REPLACE(CAST("id" AS TEXT), '-', ''), '@placeholder.lala'), "password" = '$2a$10$placeholder' WHERE "email" IS NULL`
  );
  console.log('placeholder values set');

  // Drop old OTP columns
  await sq.query(`ALTER TABLE "Users" DROP COLUMN IF EXISTS "otp"`);
  await sq.query(`ALTER TABLE "Users" DROP COLUMN IF EXISTS "isVerified"`);
  console.log('old OTP columns dropped');

  console.log('Migration complete');
  await sq.close();
  process.exit(0);
})().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});

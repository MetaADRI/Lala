const { Sequelize } = require('sequelize');
require('dotenv').config();
const sq = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});
(async () => {
  const [users] = await sq.query('SELECT id, email, name, role, phone, "createdAt" FROM "Users" ORDER BY "createdAt" DESC');
  console.log(JSON.stringify(users, null, 2));
  await sq.close();
})();

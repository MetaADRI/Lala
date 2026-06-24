const { Sequelize } = require('sequelize');
require('dotenv').config();

const sq = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

(async () => {
  await sq.authenticate();
  const [res] = await sq.query(
    "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'Users' ORDER BY ordinal_position"
  );
  console.log(JSON.stringify(res, null, 2));
  await sq.close();
})();

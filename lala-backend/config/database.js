const { Sequelize } = require('sequelize');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    '❌ DATABASE_URL is not defined. Set it in the environment (.env or Render dashboard). ' +
      'No hardcoded database credentials are used.'
  );
}

const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Required for Neon cloud hosting
    },
  },
});

module.exports = sequelize;

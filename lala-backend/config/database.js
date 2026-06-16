const { Sequelize } = require('sequelize');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ DATABASE_URL is not defined in .env');
}

const sequelize = dbUrl 
  ? new Sequelize(dbUrl, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false, // Required for Neon cloud hosting
        },
      },
    })
  : new Sequelize('lala_db', 'postgres', 'password', {
      host: 'localhost',
      dialect: 'postgres',
      logging: false
    });

module.exports = sequelize;

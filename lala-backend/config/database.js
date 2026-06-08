const { Sequelize } = require('sequelize');
require('dotenv').config();

// SQLite Configuration for zero-setup local testing
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false,
});

module.exports = sequelize;

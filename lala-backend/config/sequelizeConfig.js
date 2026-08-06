// config/sequelizeConfig.js
// Config consumed by sequelize-cli (`npm run migrate`, `npm run migrate:undo`).
// The CLI does NOT load .env itself, so we load it here. Both environments read
// DATABASE_URL; NODE_ENV only selects which key the CLI reads.
require('dotenv').config();

const common = {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Required for Neon cloud hosting
    },
  },
};

module.exports = {
  development: { ...common, use_env_variable: 'DATABASE_URL' },
  test: { ...common, use_env_variable: 'DATABASE_URL' },
  production: { ...common, use_env_variable: 'DATABASE_URL' },
};

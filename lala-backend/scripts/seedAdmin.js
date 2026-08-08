// scripts/seedAdmin.js
// Creates or updates the platform admin account. Run after deploy:
//   ADMIN_EMAIL=admin@lala.com ADMIN_PASSWORD=<strong-pass> npm run seed:admin
// Idempotent: updates the existing account (role/status/name) if present.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const User = require('../models/User');

(async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running seed:admin.');
    process.exit(1);
  }
  if (String(password).length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  try {
    await sequelize.authenticate();

    const hashed = await bcrypt.hash(String(password), 10);
    let user = await User.findOne({ where: { email } });

    if (user) {
      user.role = 'admin';
      user.status = 'active';
      user.password = hashed;
      if (process.env.ADMIN_NAME) user.name = process.env.ADMIN_NAME;
      await user.save();
      console.log(`Admin updated: ${email} (role=admin, status=active)`);
    } else {
      user = await User.create({
        email,
        password: hashed,
        name: process.env.ADMIN_NAME || 'Admin',
        role: 'admin',
        status: 'active',
      });
      console.log(`Admin created: ${email} (role=admin, status=active)`);
    }
  } catch (err) {
    console.error('seed:admin failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();

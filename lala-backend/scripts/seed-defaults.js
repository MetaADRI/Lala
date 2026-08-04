// scripts/seed-defaults.js — creates a small set of dev accounts (local/dev databases only).
// Credentials come from environment variables. No hardcoded passwords.
// Run with: node scripts/seed-defaults.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

(async () => {
  const accounts = [
    {
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
      name: 'Lala Admin',
      role: 'admin',
    },
    {
      email: process.env.SEED_HOST_EMAIL,
      password: process.env.SEED_HOST_PASSWORD,
      name: 'Bwalya Phiri',
      role: 'host',
    },
    {
      email: process.env.SEED_GUEST_EMAIL,
      password: process.env.SEED_GUEST_PASSWORD,
      name: 'Jane Doe',
      role: 'guest',
    },
  ].filter((acc) => acc.email && acc.password);

  if (accounts.length === 0) {
    console.warn(
      'No seed accounts configured. Set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (and HOST/GUEST variants) in the environment.'
    );
    process.exit(0);
  }

  for (const acc of accounts) {
    const existing = await User.findOne({ where: { email: acc.email } });
    if (existing) {
      console.log(`SKIP  ${acc.email} — already exists`);
      continue;
    }
    const password = await bcrypt.hash(acc.password, 10);
    await User.create({ ...acc, password });
    console.log(`CREATED  ${acc.email} (${acc.role})`);
  }

  console.log('\nDone. Default accounts ready.');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });

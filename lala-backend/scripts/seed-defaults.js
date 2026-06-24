const User = require('../models/User');
const bcrypt = require('bcryptjs');

(async () => {
  const accounts = [
    { email: 'admin@lala.com', password: 'Admin123!', name: 'Lala Admin', role: 'admin' },
    { email: 'host@lala.com',   password: 'Host123!',   name: 'Bwalya Phiri', role: 'host' },
    { email: 'guest@lala.com',  password: 'Guest123!',  name: 'Jane Doe',     role: 'guest' },
  ];

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

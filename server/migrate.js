require('dotenv').config();
const pool = require('./db');
const fs   = require('fs');
const path = require('path');

async function migrate() {
  const files = ['001_init.sql', '002_cms.sql'];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
    console.log(`Running ${file}...`);
    await pool.query(sql);
    console.log(`${file} done.`);
  }

  // Seed admin user
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@2026', 10);
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, name)
     VALUES ($1, $2, 'Admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [process.env.ADMIN_EMAIL || 'helloo.ai.solutions@gmail.com', hash]
  );
  console.log('Admin user seeded.');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });

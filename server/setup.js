/**
 * AI-Solutions — One-time setup script
 * Runs database migrations and seeds the default admin user.
 * Usage: node setup.js
 */
require('dotenv').config();
const fs      = require('fs');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const pool    = require('./db');

const ADMIN_EMAIL    = 'admin@ai-solutions.co.uk';
const ADMIN_PASSWORD = 'Admin@2026';
const ADMIN_NAME     = 'Admin';

const MIGRATIONS = ['001_init.sql', '002_cms.sql'];

async function run() {
  const client = await pool.connect();
  try {
    console.log('✔  Connected to PostgreSQL database:', process.env.DB_NAME);

    for (const migration of MIGRATIONS) {
      const sqlPath = path.join(__dirname, 'migrations', migration);
      if (!fs.existsSync(sqlPath)) {
        console.log(`⚠  Migration ${migration} not found — skipping`);
        continue;
      }
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sql);
      console.log(`✔  Schema applied (${migration})`);
    }

    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await client.query(
      `INSERT INTO admin_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [ADMIN_EMAIL, hash, ADMIN_NAME]
    );
    console.log('✔  Default admin user ensured');
    console.log('');
    console.log('='.repeat(50));
    console.log('  Admin login credentials');
    console.log('  Email   :', ADMIN_EMAIL);
    console.log('  Password:', ADMIN_PASSWORD);
    console.log('  URL     : http://localhost:' + (process.env.PORT || 3000) + '/admin/login.html');
    console.log('  ⚠  Change your password after first login!');
    console.log('='.repeat(50));
    console.log('');
    console.log('✔  Setup complete. Run "npm start" to launch the server.');
  } catch (err) {
    console.error('✘  Setup failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

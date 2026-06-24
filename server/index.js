/**
 * AI-Solutions — Express Server
 * Serves static frontend + REST API
 * Start: npm start  |  Dev: npm run dev
 */
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const bcrypt     = require('bcryptjs');
const rateLimit  = require('express-rate-limit');

const pool             = require('./db');
const contactRoutes    = require('./routes/contact');
const newsletterRoutes = require('./routes/newsletter');
const assistantRoutes  = require('./routes/assistant');
const adminRoutes      = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

/* ─── Middleware ─────────────────────────────────────────── */
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

/* ─── Rate limiting ──────────────────────────────────────── */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again in 15 minutes.' },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 10,
  message: { error: 'Chat rate limit reached — please wait a moment.' },
});

app.use('/api/', apiLimiter);
app.use('/api/assistant/', chatLimiter);

/* ─── API Routes ─────────────────────────────────────────── */
app.use('/api/contact',    contactRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/assistant',  assistantRoutes);
app.use('/api/admin',      adminRoutes);

/* ─── Health check ───────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ─── Serve uploaded images ──────────────────────────────── */
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

/* ─── Clean URLs — redirect /page.html → /page ──────────── */
app.use((req, res, next) => {
  // Redirect /admin and /admin/ to /admin/login
  if (req.path === '/admin' || req.path === '/admin/') {
    return res.redirect(301, '/admin/login');
  }
  // Redirect root and /index to /home
  if (req.path === '/' || req.path === '/index') {
    return res.redirect(301, '/home');
  }
  // Strip .html extension from any URL
  if (req.path.endsWith('.html')) {
    const clean = req.path.slice(0, -5) || '/home';
    return res.redirect(301, clean);
  }
  // Strip trailing slash (except root)
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const query = req.url.slice(req.path.length);
    return res.redirect(301, req.path.slice(0, -1) + query);
  }
  next();
});

/* ─── Serve static frontend files ───────────────────────── */
// extensions: ['html'] lets Express serve /gallery as gallery.html etc.
// index: false prevents auto-serving index.html for directory requests
app.use(express.static(path.join(__dirname, '..'), { extensions: ['html'], index: false }));

// Fallback — serve home.html for unknown paths
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'home.html'));
});

/* ─── Auto-migrate DB on startup ────────────────────────── */
async function runMigrations() {
  const client = await pool.connect();
  try {
    for (const file of ['001_init.sql', '002_cms.sql', '003_2fa.sql', '004_blog_fix.sql']) {
      const sqlPath = path.join(__dirname, 'migrations', file);
      if (fs.existsSync(sqlPath)) {
        await client.query(fs.readFileSync(sqlPath, 'utf8'));
        console.log(`  DB migration applied: ${file}`);
      }
    }
    const hash = await bcrypt.hash('', 12);
    await client.query(
      `INSERT INTO admin_users (email, password_hash, name)
       VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`,
      ['', hash, 'Admin']
    );
    console.log('  DB ready.');
  } catch (err) {
    console.error('  DB migration error:', err.message);
  } finally {
    client.release();
  }
}

/* ─── Start ──────────────────────────────────────────────── */
runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  AI-Solutions server is running`);
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Admin:   http://localhost:${PORT}/admin/login`);
    console.log(`  Health:  http://localhost:${PORT}/api/health\n`);
  });
});

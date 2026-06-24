const express      = require('express');
const router       = express.Router();
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const multer       = require('multer');
const speakeasy    = require('speakeasy');
const QRCode       = require('qrcode');
const pool         = require('../db');
const { requireAuth } = require('../middleware/auth');
const { makeTransporter, logoAttachment, wrap } = require('../mailer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

/* ─── In-memory stores ───────────────────────────────── */
const otpStore      = new Map(); // email → { otp, expiresAt }
const resetStore    = new Map(); // email → { token, expiresAt }
const loginAttempts = new Map(); // email → { count, lockedUntil }
const pending2FA    = new Map(); // email → { expiresAt }

function checkLockout(email) {
  const a = loginAttempts.get(email);
  if (!a || !a.lockedUntil) return null;
  if (Date.now() < a.lockedUntil) {
    const mins = Math.ceil((a.lockedUntil - Date.now()) / 60000);
    return `Account locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
  }
  loginAttempts.delete(email);
  return null;
}
function recordFail(email) {
  const a = loginAttempts.get(email) || { count: 0, lockedUntil: null };
  a.count += 1;
  if (a.count >= 5) a.lockedUntil = Date.now() + 15 * 60 * 1000;
  loginAttempts.set(email, a);
  return a.count;
}
function clearAttempts(email) { loginAttempts.delete(email); }

/* ─── Cloudinary upload setup ───────────────────────────── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const _storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'ai-solutions',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
    transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
  },
});

const upload = multer({
  storage: _storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Images only'));
  },
});

/* ─── AUTH ──────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Username and password are required.' });
  const email = username.toLowerCase().trim();

  const lockMsg = checkLockout(email);
  if (lockMsg) return res.status(429).json({ message: lockMsg });

  try {
    const { rows } = await pool.query(
      `SELECT id, email, password_hash, name, totp_secret, totp_enabled FROM admin_users WHERE email = $1`, [email]
    );
    if (!rows.length) { recordFail(email); return res.status(401).json({ message: 'Invalid credentials.' }); }
    const admin = rows[0];
    if (!await bcrypt.compare(password, admin.password_hash)) {
      const count = recordFail(email);
      const left  = Math.max(0, 5 - count);
      const suffix = left > 0 ? ` ${left} attempt${left !== 1 ? 's' : ''} remaining.` : ' Account locked for 15 minutes.';
      return res.status(401).json({ message: 'Invalid credentials.' + suffix });
    }
    clearAttempts(email);
    if (admin.totp_enabled && admin.totp_secret) {
      pending2FA.set(email, { expiresAt: Date.now() + 5 * 60 * 1000 });
      return res.json({ needs_2fa: true });
    }
    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    return res.json({ token, name: admin.name });
  } catch (err) {
    console.error('[Admin/login]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/logout', (req, res) => res.json({ success: true }));

/* ─── 2FA ───────────────────────────────────────────────── */
router.post('/2fa/verify', async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) return res.status(400).json({ message: 'Missing fields.' });
  const email = username.toLowerCase().trim();
  const pending = pending2FA.get(email);
  if (!pending || Date.now() > pending.expiresAt) {
    pending2FA.delete(email);
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, totp_secret FROM admin_users WHERE email=$1 AND totp_enabled=TRUE`, [email]
    );
    if (!rows.length) return res.status(401).json({ message: 'Invalid session.' });
    const valid = speakeasy.totp.verify({ secret: rows[0].totp_secret, encoding: 'base32', token: code, window: 1 });
    if (!valid) return res.status(401).json({ message: 'Invalid code. Try again.' });
    pending2FA.delete(email);
    const token = jwt.sign(
      { id: rows[0].id, email: rows[0].email, name: rows[0].name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    return res.json({ token, name: rows[0].name });
  } catch { return res.status(500).json({ message: 'Server error.' }); }
});

router.get('/2fa/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT totp_enabled FROM admin_users WHERE id=$1', [req.admin.id]);
    return res.json({ enabled: rows[0]?.totp_enabled || false });
  } catch { return res.status(500).json({ message: 'Server error.' }); }
});

router.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: 'AI-Solutions Admin', length: 20 });
    const qr = await QRCode.toDataURL(secret.otpauth_url);
    return res.json({ secret: secret.base32, qr });
  } catch { return res.status(500).json({ message: 'Server error.' }); }
});

router.post('/2fa/enable', requireAuth, async (req, res) => {
  const { secret, code } = req.body;
  if (!secret || !code) return res.status(400).json({ message: 'Missing fields.' });
  const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
  if (!valid) return res.status(400).json({ message: 'Invalid code. Make sure your authenticator app is synced.' });
  try {
    await pool.query('UPDATE admin_users SET totp_secret=$1, totp_enabled=TRUE WHERE id=$2', [secret, req.admin.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ message: 'Server error.' }); }
});

router.post('/2fa/disable', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'Password required to disable 2FA.' });
  try {
    const { rows } = await pool.query('SELECT password_hash FROM admin_users WHERE id=$1', [req.admin.id]);
    if (!await bcrypt.compare(password, rows[0].password_hash))
      return res.status(401).json({ message: 'Incorrect password.' });
    await pool.query('UPDATE admin_users SET totp_secret=NULL, totp_enabled=FALSE WHERE id=$1', [req.admin.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ message: 'Server error.' }); }
});

/* ─── CHANGE PASSWORD (authenticated) ───────────────── */
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: 'Both current and new password are required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  try {
    const { rows } = await pool.query(
      'SELECT password_hash FROM admin_users WHERE id = $1', [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Admin not found.' });
    if (!await bcrypt.compare(currentPassword, rows[0].password_hash))
      return res.status(401).json({ message: 'Current password is incorrect.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, req.admin.id]);
    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[change-password]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── FORGOT PASSWORD — step 1: send OTP ─────────────── */
router.post('/forgot-password', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ message: 'Email is required.' });
  try {
    const { rows } = await pool.query(
      'SELECT id FROM admin_users WHERE email = $1', [email]
    );
    if (!rows.length)
      return res.status(404).json({ message: 'No admin account found with that email.' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(email, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    const otpBody = `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a2a3a">Password Reset Request</h2>
      <p style="margin:0 0 28px;font-size:15px;color:#4a5568;line-height:1.6">
        We received a request to reset your AI-Solutions admin password.
        Use the code below — it expires in <strong>10 minutes</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        <tr>
          <td style="background:#f0f7ff;border:2px solid #0a87ce;border-radius:12px;padding:28px;text-align:center">
            <div style="font-size:11px;color:#0a87ce;font-weight:600;letter-spacing:2px;
                        text-transform:uppercase;margin-bottom:10px">Your Verification Code</div>
            <div style="font-size:46px;font-weight:800;letter-spacing:16px;color:#0a87ce;
                        font-family:'Courier New',monospace">${otp}</div>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#718096;line-height:1.6">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>`;

    await makeTransporter().sendMail({
      from:        `"AI-Solutions Admin" <${process.env.GMAIL_USER || process.env.EMAIL_USER}>`,
      to:          email,
      subject:     'AI-Solutions Password Reset Code',
      text:        `AI-Solutions Admin\n\nYour password reset code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
      html:        wrap(otpBody),
      attachments: logoAttachment(),
    });

    return res.json({ message: 'A 6-digit code has been sent to your email.' });
  } catch (err) {
    console.error('[forgot-password]', err.message);
    return res.status(500).json({ message: 'Failed to send email. Please try again later.' });
  }
});

/* ─── FORGOT PASSWORD — step 2: verify OTP ───────────── */
router.post('/verify-reset-code', (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const code  = String(req.body.code || '').trim();
  const record = otpStore.get(email);
  if (!record)
    return res.status(400).json({ message: 'No reset code found. Please request a new one.' });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ message: 'Code has expired. Please request a new one.' });
  }
  if (record.otp !== code)
    return res.status(400).json({ message: 'Incorrect code. Please try again.' });

  const resetToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  resetStore.set(email, { token: resetToken, expiresAt: Date.now() + 10 * 60 * 1000 });
  otpStore.delete(email);
  return res.json({ resetToken });
});

/* ─── FORGOT PASSWORD — step 3: set new password ─────── */
router.post('/reset-password', async (req, res) => {
  const email      = (req.body.email || '').toLowerCase().trim();
  const resetToken = req.body.resetToken || '';
  const newPassword = req.body.newPassword || '';
  const record = resetStore.get(email);
  if (!record || record.token !== resetToken || Date.now() > record.expiresAt)
    return res.status(400).json({ message: 'Invalid or expired session. Please start over.' });
  if (newPassword.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE email = $2', [hash, email]);
    resetStore.delete(email);
    return res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('[reset-password]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── DASHBOARD STATS ──────────────────────────────────── */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const [cRes, sRes, bRes, eRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                               AS total,
          COUNT(*) FILTER (WHERE status='new')                  AS new,
          COUNT(*) FILTER (WHERE status='replied')              AS replied,
          COUNT(*) FILTER (WHERE DATE_TRUNC('month',created_at)
                                 = DATE_TRUNC('month',NOW()))   AS "thisMonth"
        FROM contacts
      `),
      pool.query(`SELECT COUNT(*) AS total FROM newsletter_subscribers WHERE status='active'`),
      pool.query(`SELECT COUNT(*) AS total FROM blog_posts WHERE status='published'`),
      pool.query(`SELECT COUNT(*) AS total FROM events WHERE is_past = FALSE`),
    ]);
    const c = cRes.rows[0];
    return res.json({
      total:          parseInt(c.total),
      new:            parseInt(c.new),
      replied:        parseInt(c.replied),
      thisMonth:      parseInt(c.thisMonth),
      subscribers:    parseInt(sRes.rows[0].total),
      blogPosts:      parseInt(bRes.rows[0].total),
      upcomingEvents: parseInt(eRes.rows[0].total),
    });
  } catch (err) {
    console.error('[Admin/stats]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── ENQUIRIES ────────────────────────────────────────── */
router.get('/enquiries', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, first_name||' '||last_name AS name, email, phone, company,
             country, job_title, industry, goal, message, status, created_at
      FROM contacts ORDER BY created_at DESC
    `);
    await pool.query(`UPDATE contacts SET status='read' WHERE status='new'`);
    return res.json(rows);
  } catch (err) {
    console.error('[Admin/enquiries]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/enquiries/:id', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!['new','read','replied'].includes(status))
    return res.status(400).json({ message: 'Invalid status.' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE contacts SET status=$1 WHERE id=$2`, [status, req.params.id]
    );
    return rowCount ? res.json({ success: true }) : res.status(404).json({ message: 'Not found.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/enquiries/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM contacts WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── NEWSLETTER SUBSCRIBERS ──────────────────────────── */
router.get('/subscribers', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, status, subscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/subscribers', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO newsletter_subscribers (email)
       VALUES ($1) ON CONFLICT (email) DO UPDATE SET status='active'
       RETURNING *`,
      [email.toLowerCase().trim()]
    );
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/subscribers/:id', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!['active','unsubscribed'].includes(status))
    return res.status(400).json({ message: 'Invalid status.' });
  try {
    const { rows } = await pool.query(
      `UPDATE newsletter_subscribers SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    return rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'Not found.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/subscribers/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM newsletter_subscribers WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── BLOG POSTS ───────────────────────────────────────── */
router.get('/blog', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM blog_posts ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    console.error('[Admin/blog GET]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/blog', requireAuth, async (req, res) => {
  const { title, category, excerpt, content, author, image_url, status } = req.body;
  if (!title) return res.status(400).json({ message: 'Title is required.' });
  try {
    let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = await pool.query('SELECT id FROM blog_posts WHERE slug=$1', [slug]);
    if (existing.rows.length) slug = `${slug}-${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO blog_posts (title, slug, category, excerpt, content, author, image_url, status, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, slug, category, excerpt, content, author || 'AI-Solutions Team', image_url || null,
       status || 'draft', status === 'published' ? new Date() : null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Admin/blog POST]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/blog/:id', requireAuth, async (req, res) => {
  const { title, category, excerpt, content, author, image_url, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE blog_posts
       SET title=$1, category=$2, excerpt=$3, content=$4, author=$5, image_url=$6, status=$7,
           updated_at=NOW(),
           published_at = CASE WHEN $8='published' AND published_at IS NULL THEN NOW() ELSE published_at END
       WHERE id=$9 RETURNING *`,
      [title, category, excerpt, content, author, image_url || null, status, status, req.params.id]
    );
    return rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'Not found.' });
  } catch (err) {
    console.error('[Admin/blog PUT]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/blog/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM blog_posts WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── EVENTS ──────────────────────────────────────────── */
router.get('/events', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM events ORDER BY event_date DESC');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/events', requireAuth, async (req, res) => {
  const { title, type, event_date, time_info, location, description, is_past } = req.body;
  if (!title || !event_date) return res.status(400).json({ message: 'Title and date required.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO events (title, type, event_date, time_info, location, description, is_past)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, type, event_date, time_info, location, description, is_past || false]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/events/:id', requireAuth, async (req, res) => {
  const { title, type, event_date, time_info, location, description, is_past } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE events SET title=$1, type=$2, event_date=$3, time_info=$4,
       location=$5, description=$6, is_past=$7 WHERE id=$8 RETURNING *`,
      [title, type, event_date, time_info, location, description, is_past, req.params.id]
    );
    return rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'Not found.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/events/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM events WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── TESTIMONIALS ────────────────────────────────────── */
router.get('/testimonials', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM testimonials ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/testimonials', requireAuth, async (req, res) => {
  const { client_name, client_role, company, quote, product, rating, initials, status } = req.body;
  if (!client_name || !quote) return res.status(400).json({ message: 'Name and quote required.' });
  try {
    const autoInitials = initials ||
      client_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const { rows } = await pool.query(
      `INSERT INTO testimonials (client_name, client_role, company, quote, product, rating, initials, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [client_name, client_role, company, quote, product, rating || 5.0, autoInitials, status || 'published']
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/testimonials/:id', requireAuth, async (req, res) => {
  const { client_name, client_role, company, quote, product, rating, initials, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE testimonials SET client_name=$1, client_role=$2, company=$3, quote=$4,
       product=$5, rating=$6, initials=$7, status=$8 WHERE id=$9 RETURNING *`,
      [client_name, client_role, company, quote, product, rating, initials, status, req.params.id]
    );
    return rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'Not found.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/testimonials/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM testimonials WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── TEAM MEMBERS ─────────────────────────────────────── */
router.get('/team', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM team_members ORDER BY order_index ASC, created_at ASC'
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/team', requireAuth, async (req, res) => {
  const { name, role, bio, initials, image_url, order_index, status } = req.body;
  if (!name) return res.status(400).json({ message: 'Name required.' });
  try {
    const autoInitials = initials ||
      name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const { rows } = await pool.query(
      `INSERT INTO team_members (name, role, bio, initials, image_url, order_index, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, role, bio, autoInitials, image_url, order_index || 0, status || 'active']
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/team/:id', requireAuth, async (req, res) => {
  const { name, role, bio, initials, image_url, order_index, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE team_members SET name=$1, role=$2, bio=$3, initials=$4,
       image_url=$5, order_index=$6, status=$7 WHERE id=$8 RETURNING *`,
      [name, role, bio, initials, image_url, order_index, status, req.params.id]
    );
    return rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'Not found.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/team/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM team_members WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── GALLERY ──────────────────────────────────────────── */
router.get('/gallery', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM gallery_items ORDER BY order_index ASC, created_at DESC'
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/gallery', requireAuth, async (req, res) => {
  const { title, description, image_url, category, order_index, status } = req.body;
  if (!title) return res.status(400).json({ message: 'Title required.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO gallery_items (title, description, image_url, category, order_index, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description, image_url, category, order_index || 0, status || 'active']
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/gallery/:id', requireAuth, async (req, res) => {
  const { title, description, image_url, category, order_index, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE gallery_items SET title=$1, description=$2, image_url=$3,
       category=$4, order_index=$5, status=$6 WHERE id=$7 RETURNING *`,
      [title, description, image_url, category, order_index, status, req.params.id]
    );
    return rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'Not found.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/gallery/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM gallery_items WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

/* ─── FILE UPLOAD ──────────────────────────────────────── */
router.post('/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
  return res.json({ url: req.file.path });
});

/* ─── PUBLIC ENDPOINTS (no auth — used by frontend) ────── */
router.get('/public/blog', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, slug, category, excerpt, content, author, image_url, published_at
       FROM blog_posts WHERE status='published' ORDER BY published_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('[public/blog GET]', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/public/events', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM events ORDER BY is_past ASC, event_date ASC`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/public/testimonials', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM testimonials WHERE status='published' ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/public/gallery', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM gallery_items WHERE status='active' ORDER BY order_index ASC, created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/public/team', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM team_members WHERE status='active' ORDER BY order_index ASC`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;

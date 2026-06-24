const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const { makeTransporter, logoAttachment, wrap, BLUE } = require('../mailer');

router.post('/', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();

  if (!email)
    return res.status(400).json({ message: 'Email is required.' });

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(email))
    return res.status(400).json({ message: 'Invalid email address.' });

  try {
    const result = await pool.query(
      `INSERT INTO newsletter_subscribers (email)
       VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET status = 'active'
       RETURNING (xmax = 0) AS is_new`,
      [email]
    );

    const isNew = result.rows[0]?.is_new !== false;

    /* Only send welcome email on first subscription */
    if (isNew) {
      const welcomeBody = `
        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a2a3a">
          You're in! Welcome to AI-Solutions Insights.
        </h2>
        <p style="margin:0 0 22px;font-size:15px;color:#4a5568;line-height:1.7">
          Thank you for subscribing. You'll be the first to receive:
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px">
          ${[
            ['🔬', 'AI Research &amp; Breakthroughs', 'Deep dives into the latest advances in applied AI'],
            ['💡', 'Industry Insights',               'How AI is transforming high-stakes industries'],
            ['🛠️', 'Practical Guides',                'Tutorials and frameworks you can use today'],
            ['📣', 'Company Updates',                 'News, events, and product announcements'],
          ].map(([icon, title, desc]) => `
          <tr>
            <td style="padding:10px 0;vertical-align:top;width:36px;font-size:20px">${icon}</td>
            <td style="padding:10px 0 10px 10px">
              <div style="font-size:14px;font-weight:700;color:#1a2a3a;margin-bottom:2px">${title}</div>
              <div style="font-size:13px;color:#718096">${desc}</div>
            </td>
          </tr>`).join('')}
        </table>

        <div style="background:#f0f7ff;border:1.5px solid #bfdbfe;border-radius:12px;
                    padding:20px 24px;margin-bottom:26px;text-align:center">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1a2a3a">
            Our promise to you
          </p>
          <p style="margin:0;font-size:13px;color:#4a5568;line-height:1.6">
            No spam. No fluff. Just valuable AI insights delivered straight to your inbox.
            Unsubscribe anytime.
          </p>
        </div>

        <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
          <tr>
            <td style="background:${BLUE};border-radius:8px;padding:12px 28px">
              <a href="https://aisolutionss.com/blog.html" target="_blank"
                style="color:#fff;font-size:14px;font-weight:600;text-decoration:none">
                Read Our Latest Articles →
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0;font-size:13px;color:#718096;line-height:1.6">
          Warm regards,<br/>
          <strong style="color:#1a2a3a">The AI-Solutions Team</strong><br/>
          <span style="color:${BLUE}">aisolutionss.com</span>
        </p>`;

      const welcomeText =
        `Welcome to AI-Solutions Insights!\n\n` +
        `Thank you for subscribing. Here is what you will receive:\n\n` +
        `- AI Research & Breakthroughs\n` +
        `- Industry Insights\n` +
        `- Practical Guides\n` +
        `- Company Updates\n\n` +
        `No spam. No fluff. Unsubscribe anytime.\n\n` +
        `Read our latest articles: https://aisolutionss.com/blog.html\n\n` +
        `The AI-Solutions Team\naisolutionss.com`;

      await makeTransporter().sendMail({
        from:        `"AI-Solutions Insights" <${process.env.GMAIL_USER || process.env.EMAIL_USER}>`,
        to:          email,
        subject:     'Welcome to AI-Solutions Insights',
        text:        welcomeText,
        html:        wrap(welcomeBody),
        attachments: logoAttachment(),
        headers:     { 'List-Unsubscribe': `<mailto:${process.env.GMAIL_USER || process.env.EMAIL_USER}?subject=unsubscribe>` },
      });
    }

    return res.json({
      success: true,
      message: isNew
        ? "You're subscribed! Check your inbox for a welcome email."
        : "You're already subscribed — welcome back!",
    });
  } catch (err) {
    console.error('[Newsletter] error:', err.message);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;

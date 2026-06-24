const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const { makeTransporter, logoAttachment, wrap, BLUE } = require('../mailer');

router.post('/', async (req, res) => {
  const {
    first_name, last_name, email,
    job_title, industry, goal,
    message = null, company = null,
    phone = null, country = null,
  } = req.body;

  if (!first_name || !last_name || !email || !job_title || !goal)
    return res.status(400).json({ message: 'Required fields are missing.' });

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(email))
    return res.status(400).json({ message: 'Invalid email address.' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO contacts
         (first_name, last_name, email, phone, company, country, job_title, industry, goal, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, created_at`,
      [first_name, last_name, email, phone, company, country, job_title, industry, goal, message]
    );

    const fullName    = `${first_name} ${last_name}`;
    const domain      = email.split('@')[1]?.toLowerCase() || '';
    const submittedAt = new Date(rows[0].created_at).toLocaleString('en-GB', {
      dateStyle: 'long', timeStyle: 'short',
    });

    const transporter = makeTransporter();
    const attachments = logoAttachment();

    /* helper: one table row */
    function tr(label, value) {
      if (!value) return '';
      return `<tr>
        <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#4a5568;
                   white-space:nowrap;border-bottom:1px solid #f0f4f8;width:38%">${label}</td>
        <td style="padding:10px 14px;font-size:13px;color:#1a2a3a;
                   border-bottom:1px solid #f0f4f8">${value}</td>
      </tr>`;
    }

    /* ── 1. Notification to company ── */
    const notifyHtml = wrap(`
      <h2 style="margin:0 0 6px;font-size:19px;font-weight:700;color:#1a2a3a">New Enquiry Received</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#718096">Submitted on ${submittedAt}</p>
      <table width="100%" cellpadding="0" cellspacing="0"
        style="border:1px solid #e8ecf0;border-radius:10px;overflow:hidden;margin-bottom:24px">
        ${tr('Full Name',  fullName)}
        ${tr('Email',      email)}
        ${tr('Phone',      phone)}
        ${tr('Company',    company)}
        ${tr('Country',    country)}
        ${tr('Job Title',  job_title)}
        ${tr('Industry',   industry)}
        ${tr('Goal',       goal)}
      </table>
      ${message ? `
      <div style="background:#f7f9fc;border-left:3px solid ${BLUE};border-radius:0 8px 8px 0;
                  padding:16px 18px">
        <div style="font-size:11px;font-weight:700;color:${BLUE};letter-spacing:1px;
                    text-transform:uppercase;margin-bottom:8px">Message</div>
        <p style="margin:0;font-size:14px;color:#2d3e50;line-height:1.7">${message}</p>
      </div>` : ''}`);

    const notifyText =
      `New Enquiry — AI-Solutions\n\nSubmitted: ${submittedAt}\n\n` +
      `Name:      ${fullName}\n` +
      `Email:     ${email}\n` +
      (phone    ? `Phone:     ${phone}\n`    : '') +
      (company  ? `Company:   ${company}\n`  : '') +
      (country  ? `Country:   ${country}\n`  : '') +
      `Job Title: ${job_title}\n` +
      (industry ? `Industry:  ${industry}\n` : '') +
      `Goal:      ${goal}\n` +
      (message  ? `\nMessage:\n${message}\n` : '');

    await transporter.sendMail({
      from:     `"AI-Solutions" <${process.env.GMAIL_USER || process.env.EMAIL_USER}>`,
      to:       process.env.GMAIL_USER || process.env.EMAIL_USER,
      replyTo:  email,
      subject:  `New Enquiry from ${fullName}`,
      text:     notifyText,
      html:     notifyHtml,
      attachments,
    });

    /* ── 2. Auto-reply to enquirer — ALL details ── */
    const fields = [
      ['Full Name',  fullName],
      ['Email',      email],
      ['Phone',      phone],
      ['Company',    company],
      ['Country',    country],
      ['Job Title',  job_title],
      ['Industry',   industry],
      ['Goal',       goal],
    ].filter(([, v]) => v);

    const replyHtml = wrap(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a2a3a">
        Thank you, ${first_name}!
      </h2>
      <p style="margin:0 0 22px;font-size:15px;color:#4a5568;line-height:1.7">
        We have received your enquiry and our team is already reviewing it.
        You can expect a personalised response within <strong>1 business day</strong>.
      </p>

      <div style="background:#f0f7ff;border:1.5px solid #bfdbfe;border-radius:12px;
                  padding:22px 24px;margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;color:${BLUE};letter-spacing:1.2px;
                    text-transform:uppercase;margin-bottom:16px">Your Submission Details</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${fields.map(([label, value]) => `
          <tr>
            <td style="font-size:13px;color:#4a5568;padding:5px 0;width:38%;
                       vertical-align:top">${label}</td>
            <td style="font-size:13px;color:#1a2a3a;font-weight:600;padding:5px 0">${value}</td>
          </tr>`).join('')}
        </table>
        ${message ? `
        <div style="border-top:1px solid #bfdbfe;margin-top:14px;padding-top:14px">
          <div style="font-size:12px;color:#4a5568;margin-bottom:6px;font-weight:600">Your Message</div>
          <p style="margin:0;font-size:13px;color:#1a2a3a;line-height:1.7">${message}</p>
        </div>` : ''}
      </div>

      <p style="margin:0 0 22px;font-size:14px;color:#4a5568;line-height:1.7">
        While you wait, feel free to explore how AI-Solutions is helping organisations
        build AI that <strong>works when mistakes matter</strong>.
      </p>

      <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
        <tr>
          <td style="background:${BLUE};border-radius:8px;padding:12px 28px">
            <a href="https://aisolutionss.com" target="_blank"
              style="color:#fff;font-size:14px;font-weight:600;text-decoration:none">
              Visit Our Website
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:13px;color:#718096;line-height:1.7">
        Warm regards,<br/>
        <strong style="color:#1a2a3a">The AI-Solutions Team</strong><br/>
        <span style="color:${BLUE}">aisolutionss.com</span>
      </p>`);

    const replyText =
      `Hi ${first_name},\n\n` +
      `Thank you for reaching out to AI-Solutions.\n\n` +
      `We have received your enquiry and our team is reviewing it. ` +
      `You can expect a response within 1 business day.\n\n` +
      `--- Your Submission ---\n` +
      fields.map(([l, v]) => `${l}: ${v}`).join('\n') +
      (message ? `\n\nYour Message:\n${message}` : '') +
      `\n\n---\nThe AI-Solutions Team\naisolutionss.com`;

    await transporter.sendMail({
      from:     `"AI-Solutions Team" <${process.env.GMAIL_USER || process.env.EMAIL_USER}>`,
      to:       email,
      subject:  `We received your enquiry, ${first_name} - AI-Solutions`,
      text:     replyText,
      html:     replyHtml,
      attachments,
      headers:  { 'X-Entity-Ref-ID': `contact-${rows[0].id}` },
    });

    return res.status(201).json({
      success: true,
      id: rows[0].id,
      message: "Thank you! We'll be in touch within one business day.",
    });
  } catch (err) {
    console.error('[Contact] error:', err.message);
    return res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

module.exports = router;

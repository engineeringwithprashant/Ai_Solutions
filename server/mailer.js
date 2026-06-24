const { Resend } = require('resend');

const BLUE        = '#0a87ce';
const SENDER      = 'AI-Solutions <noreply@aisolutionss.com>';
const LOGO_URL    = 'https://aisolutionss.com/logo.png';

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/* Drop-in replacement for nodemailer's transporter.sendMail() */
function makeTransporter() {
  return {
    sendMail: async ({ to, replyTo, subject, text, html }) => {
      const result = await getResend().emails.send({
        from:     SENDER,
        to:       Array.isArray(to) ? to : [to],
        reply_to: replyTo,
        subject,
        text,
        html,
      });
      if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
      return result;
    },
  };
}

/* CID attachments not needed — logo referenced by hosted URL */
function logoAttachment() { return []; }

function emailHeader() {
  return `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:linear-gradient(135deg,${BLUE} 0%,#065f9e 100%);
           padding:28px 40px 24px;text-align:center">
    <tr><td>
      <img src="${LOGO_URL}" width="48" height="48" alt="AI-Solutions"
           style="display:inline-block;margin-bottom:10px;
                  border-radius:8px;vertical-align:middle"/>
      <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px">
        <span style="color:#fff">AI</span><span style="color:rgba(255,255,255,0.72)">-Solutions</span>
      </div>
      <div style="font-size:10px;color:rgba(255,255,255,0.5);
                  letter-spacing:2.5px;text-transform:uppercase;margin-top:5px">
        Intelligent AI for Critical Operations
      </div>
    </td></tr>
  </table>`;
}

function emailFooter() {
  return `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:#f7f9fc;border-top:1px solid #e8ecf0;padding:18px 40px;text-align:center">
    <tr><td>
      <div style="font-size:13px;font-weight:700;color:#2d3e50;margin-bottom:3px">
        <span style="color:${BLUE}">AI</span>-Solutions
      </div>
      <div style="font-size:11px;color:#a0aec0">
        This is an automated message — please do not reply directly to this email.
      </div>
    </td></tr>
  </table>`;
}

function wrap(bodyHtml) {
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:40px 16px">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0"
        style="background:#fff;border-radius:16px;overflow:hidden;
               box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:100%">
        ${emailHeader()}
        <tr><td style="padding:36px 40px">${bodyHtml}</td></tr>
        ${emailFooter()}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { makeTransporter, logoAttachment, wrap, BLUE };

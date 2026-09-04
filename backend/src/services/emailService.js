import nodemailer from 'nodemailer';

let transporter = null;

function getAppUrl() {
  return (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

function getFrom() {
  return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@reyvia.app';
}

function ensureTransporter() {
  if (transporter) return transporter;
  const host = process.env.EMAIL_HOST;
  if (!host) return null;

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: String(process.env.EMAIL_PORT) === '465',
    auth: process.env.EMAIL_USER
      ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS || '' }
      : undefined,
  });
  return transporter;
}

/**
 * Send an email. If EMAIL_HOST is unset, logs and resolves without throwing.
 */
export async function sendMail({ to, subject, html, text }) {
  if (!to) {
    console.warn('[emailService] skip: missing recipient');
    return { skipped: true, reason: 'missing_to' };
  }

  const transport = ensureTransporter();
  if (!transport) {
    console.log(`[emailService] EMAIL_HOST unset — skip send to ${to}: ${subject}`);
    return { skipped: true, reason: 'email_unconfigured' };
  }

  const info = await transport.sendMail({
    from: getFrom(),
    to,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  });
  return { skipped: false, messageId: info.messageId };
}

export function welcomeTemplate({ name }) {
  const appUrl = getAppUrl();
  const display = name || 'there';
  return {
    subject: 'Welcome to Reyvia',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h1 style="font-size:22px">Welcome, ${escapeHtml(display)}</h1>
        <p>Your Reyvia studio account is ready. New accounts start with <strong>$0.00</strong> studio balance — add funds anytime to produce films.</p>
        <p><a href="${appUrl}/app/film-studio" style="display:inline-block;padding:10px 16px;background:#6d28d9;color:#fff;border-radius:8px;text-decoration:none">Open studio</a></p>
        <p style="color:#666;font-size:13px">If you did not create this account, you can ignore this email.</p>
      </div>
    `,
    text: `Welcome, ${display}. Your Reyvia studio is ready. Open ${appUrl}/app/film-studio to get started. New accounts start with $0 balance.`,
  };
}

export function passwordResetTemplate({ name, resetUrl }) {
  const display = name || 'there';
  return {
    subject: 'Reset your Reyvia password',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h1 style="font-size:22px">Password reset</h1>
        <p>Hi ${escapeHtml(display)}, we received a request to reset your password.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#6d28d9;color:#fff;border-radius:8px;text-decoration:none">Reset password</a></p>
        <p style="color:#666;font-size:13px">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
      </div>
    `,
    text: `Hi ${display}, reset your Reyvia password: ${resetUrl} (expires in 1 hour).`,
  };
}

export function videoReadyTemplate({ name, title, jobUrl }) {
  const display = name || 'there';
  const film = title || 'Your film';
  return {
    subject: `${film} is ready`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h1 style="font-size:22px">Your film is ready</h1>
        <p>Hi ${escapeHtml(display)}, <strong>${escapeHtml(film)}</strong> finished rendering.</p>
        <p><a href="${jobUrl}" style="display:inline-block;padding:10px 16px;background:#6d28d9;color:#fff;border-radius:8px;text-decoration:none">View film</a></p>
      </div>
    `,
    text: `Hi ${display}, "${film}" is ready. View it at ${jobUrl}`,
  };
}

export function adminBulkTemplate({ subject, html, text }) {
  return {
    subject: subject || 'Message from Reyvia',
    html: html || `<div style="font-family:system-ui,sans-serif">${escapeHtml(text || '')}</div>`,
    text: text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''),
  };
}

export async function sendWelcomeEmail(user) {
  const tpl = welcomeTemplate({ name: user?.name });
  return sendMail({ to: user?.email, ...tpl });
}

export async function sendPasswordResetEmail(user, resetToken) {
  const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const tpl = passwordResetTemplate({ name: user?.name, resetUrl });
  return sendMail({ to: user?.email, ...tpl });
}

export async function sendVideoReadyEmail(user, job) {
  if (!user?.email) return { skipped: true, reason: 'missing_email' };
  const jobUrl = `${getAppUrl()}/app/jobs/${job?._id || job?.id || ''}`;
  const tpl = videoReadyTemplate({ name: user.name, title: job?.title, jobUrl });
  return sendMail({ to: user.email, ...tpl });
}

export async function sendAdminBulkEmail({ subject, html, text, users }) {
  const tpl = adminBulkTemplate({ subject, html, text });
  const results = [];
  for (const user of users || []) {
    if (!user?.email) continue;
    // eslint-disable-next-line no-await-in-loop
    results.push(await sendMail({ to: user.email, ...tpl }));
  }
  return results;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default {
  sendMail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVideoReadyEmail,
  sendAdminBulkEmail,
  welcomeTemplate,
  passwordResetTemplate,
  videoReadyTemplate,
  adminBulkTemplate,
};

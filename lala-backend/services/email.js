const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend only accepts senders from a verified domain or the sandbox
// (onboarding@resend.dev). Configure RESEND_FROM once a custom domain
// (e.g. no-reply@lalazm.com) is verified in the Resend dashboard.
const FROM = process.env.RESEND_FROM || 'Lala Support <onboarding@resend.dev>';

const EMAIL_STYLE = 'font-family: \'Segoe UI\', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #F9FAFB; border-radius: 12px;';
const LOGO_STYLE = 'text-align: center; margin-bottom: 24px;';
const LOGO_TEXT = '<span style="font-size: 28px; font-weight: 800; color: #1B5E20;">Lala</span>';
const CARD_STYLE = 'background: #fff; border-radius: 12px; padding: 32px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);';
const FOOTER_STYLE = 'font-size: 12px; color: #999; margin: 24px 0 0; text-align: center;';

function wrap(title, bodyHtml) {
  return `
    <div style="${EMAIL_STYLE}">
      <div style="${LOGO_STYLE}">${LOGO_TEXT}</div>
      <div style="${CARD_STYLE}">
        <h1 style="font-size: 18px; color: #111; margin: 0 0 8px;">${title}</h1>
        ${bodyHtml}
      </div>
    </div>`;
}

exports.sendPasswordResetLink = async (to, resetUrl) => {
  const html = wrap('Reset Your Password', `
    <p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.5;">
      Click the button below to reset your password. This link expires in 30 minutes.
    </p>
    <div style="text-align: center; margin: 0 0 24px;">
      <a href="${resetUrl}" style="display: inline-block; background: #1B5E20; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700;">Reset Password</a>
    </div>
    <p style="font-size: 12px; color: #999; line-height: 1.5; margin: 0 0 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #1B5E20; word-break: break-all;">${resetUrl}</a>
    </p>
    <p style="${FOOTER_STYLE}">If you didn't request this, you can safely ignore this email.</p>
  `);

  const { data, error } = await resend.emails.send({ from: FROM, to: [to], subject: 'Lala — Reset Your Password', html });
  if (error) throw new Error(error.message);
  return data;
};

exports.sendConfirmationEmail = async (to, confirmUrl) => {
  const html = wrap('Confirm Your Email', `
    <p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.5;">
      Thanks for signing up for Lala! Click the button below to confirm your email address and activate your account. This link expires in 24 hours.
    </p>
    <div style="text-align: center; margin: 0 0 24px;">
      <a href="${confirmUrl}" style="display: inline-block; background: #1B5E20; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700;">Confirm Email Address</a>
    </div>
    <p style="font-size: 12px; color: #999; line-height: 1.5; margin: 0 0 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${confirmUrl}" style="color: #1B5E20; word-break: break-all;">${confirmUrl}</a>
    </p>
  `);

  const { data, error } = await resend.emails.send({ from: FROM, to: [to], subject: 'Lala — Confirm Your Email', html });
  if (error) throw new Error(error.message);
  return data;
};

exports.sendLoginOTP = async (to, code) => {
  const html = wrap('Your Login Code', `
    <p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.5;">
      Use the code below to sign in to your Lala account. It expires in 5 minutes.
    </p>
    <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; text-align: center; letter-spacing: 8px; font-size: 32px; font-weight: 700; color: #1B5E20;">
      ${code}
    </div>
    <p style="${FOOTER_STYLE}">If you didn't try to sign in, you can safely ignore this email.</p>
  `);

  const { data, error } = await resend.emails.send({ from: FROM, to: [to], subject: 'Lala — Your Login Code', html });
  if (error) throw new Error(error.message);
  return data;
};

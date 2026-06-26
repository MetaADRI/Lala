const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Lala <onboarding@resend.dev>';

exports.sendPasswordResetCode = async (to, code) => {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject: 'Lala — Password Reset Code',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #F9FAFB; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 28px; font-weight: 800; color: #1B5E20;">Lala</span>
        </div>
        <div style="background: #fff; border-radius: 12px; padding: 32px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
          <h1 style="font-size: 18px; color: #111; margin: 0 0 8px;">Password Reset Code</h1>
          <p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.5;">
            Use the code below to reset your password. It expires in 30 minutes.
          </p>
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; text-align: center; letter-spacing: 8px; font-size: 32px; font-weight: 700; color: #1B5E20;">
            ${code}
          </div>
          <p style="font-size: 12px; color: #999; margin: 24px 0 0; text-align: center;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      </div>
    `
  });

  if (error) throw new Error(error.message);
  return data;
};

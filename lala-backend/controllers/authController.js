const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const EmailConfirmToken = require('../models/EmailConfirmToken');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Sequelize } = require('sequelize');

const emailService = require('../services/email');
const logger = require('../utils/logger');
const { asyncHandler, AppError, badRequest, notFound, conflict, forbidden } = require('../middleware/errorHandler');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;       // 30 minutes — password reset
const CONFIRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — email confirmation
const LOGIN_OTP_TTL_MS = 5 * 60 * 1000;          // 5 minutes — login OTP

// Only ever store/compare hashes, never plaintext.
function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function codeMatches(storedHash, code) {
  const a = Buffer.from(sha256(code), 'utf8');
  const b = Buffer.from(String(storedHash || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signToken(user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  return { token, user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status } };
}

function frontendUrl() {
  return process.env.FRONTEND_URL || 'https://www.lalabookings.com';
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER  — creates user (unconfirmed) + sends confirmation email
// ─────────────────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { email, password, name, phone, role } = req.body;
  if (!email || !password) throw badRequest('Email and password are required');

  const safeRole = role === 'host' ? 'host' : 'guest';

  const existing = await User.findOne({ where: { email } });
  if (existing) throw badRequest('An account with this email already exists');

  const hashedPassword = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await User.create({
      email, password: hashedPassword, name, phone, role: safeRole,
      emailConfirmed: false
    });
  } catch (err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
      throw conflict('An account with this email already exists');
    }
    throw err;
  }

  // Generate confirmation token (plain UUID — 256-bit entropy, no hashing needed)
  const token = crypto.randomBytes(32).toString('hex');
  await EmailConfirmToken.destroy({ where: { email } });
  await EmailConfirmToken.create({
    email,
    token,
    expiresAt: new Date(Date.now() + CONFIRM_TOKEN_TTL_MS),
  });

  const confirmUrl = `${frontendUrl()}/confirm-email.html?token=${token}`;

  try {
    await emailService.sendConfirmationEmail(email, confirmUrl);
  } catch (err) {
    logger.error('auth.confirm-email.failed', { email, err: err.message });
    // Don't fail registration — user exists, they can resend later
  }

  const payload = { message: 'Account created. Please check your email to confirm your account.', email };
  // Dev convenience: expose the confirmation URL in non-production
  if (process.env.NODE_ENV !== 'production') {
    payload.confirmUrl = confirmUrl;
    payload.devToken = token;
  }
  res.status(201).json(payload);
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM EMAIL  — user clicks the link from their email
// ─────────────────────────────────────────────────────────────────────────────
exports.confirmEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw badRequest('Token is required');

  const record = await EmailConfirmToken.findOne({ where: { token, used: false } });
  if (!record) throw badRequest('Invalid or already-used confirmation link');

  if (Date.now() > new Date(record.expiresAt).getTime()) {
    await record.destroy();
    throw badRequest('Confirmation link has expired. Please request a new one.');
  }

  const user = await User.findOne({ where: { email: record.email } });
  if (!user) throw notFound('User not found');

  user.emailConfirmed = true;
  await user.save();
  await record.destroy();

  res.json({ message: 'Email confirmed! You can now sign in.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// RESEND CONFIRMATION  — generate a fresh token and resend the email
// ─────────────────────────────────────────────────────────────────────────────
exports.resendConfirmation = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw badRequest('Email is required');

  const user = await User.findOne({ where: { email } });
  if (!user) throw notFound('No account found with this email');
  if (user.emailConfirmed) throw badRequest('This email is already confirmed. You can sign in.');

  await EmailConfirmToken.destroy({ where: { email } });

  const token = crypto.randomBytes(32).toString('hex');
  await EmailConfirmToken.create({
    email,
    token,
    expiresAt: new Date(Date.now() + CONFIRM_TOKEN_TTL_MS),
  });

  const confirmUrl = `${frontendUrl()}/confirm-email.html?token=${token}`;

  try {
    await emailService.sendConfirmationEmail(email, confirmUrl);
  } catch (err) {
    logger.error('auth.resend-confirm.failed', { email, err: err.message });
    throw new AppError(502, 'Failed to send confirmation email. Please try again.');
  }

  const payload = { message: 'Confirmation email sent' };
  if (process.env.NODE_ENV !== 'production') {
    payload.confirmUrl = confirmUrl;
    payload.devToken = token;
  }
  res.json(payload);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN  — verify credentials → send OTP if email confirmed
// ─────────────────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw badRequest('Email and password are required');

  const user = await User.findOne({ where: { email } });
  if (!user) throw badRequest('Invalid email or password');

  if (user.status === 'suspended') throw forbidden('Your account has been suspended. Contact support.');
  if (user.status === 'paused') throw forbidden('Your account is paused. Contact support to reactivate it.');

  if (!user.emailConfirmed) {
    throw forbidden('Please confirm your email first. Check your inbox for the confirmation link.');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw badRequest('Invalid email or password');

  // Generate 6-digit OTP
  const otpCode = crypto.randomInt(100000, 999999).toString();
  await PasswordResetToken.destroy({ where: { email, used: false } });
  await PasswordResetToken.create({
    email,
    codeHash: sha256(otpCode),
    expiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS),
  });

  try {
    await emailService.sendLoginOTP(email, otpCode);
  } catch (err) {
    logger.error('auth.login-otp.failed', { email, err: err.message });
    throw new AppError(502, 'Failed to send OTP. Please try again.');
  }

  const payload = { message: 'OTP sent to your email', email, requiresOTP: true };
  if (process.env.NODE_ENV !== 'production') {
    payload.devOTP = otpCode;
  }
  res.json(payload);
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY LOGIN OTP  — verify the code and return JWT
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyLoginOTP = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) throw badRequest('Email and code are required');

  const user = await User.findOne({ where: { email } });
  if (!user) throw notFound('User not found');

  const stored = await PasswordResetToken.findOne({
    where: { email, used: false },
    order: [['createdAt', 'DESC']],
  });
  if (!stored) throw badRequest('No OTP requested. Please sign in again.');

  if (Date.now() > new Date(stored.expiresAt).getTime()) {
    await stored.destroy();
    throw badRequest('OTP has expired. Please sign in again.');
  }

  if (!codeMatches(stored.codeHash, code)) {
    throw badRequest('Invalid OTP code');
  }

  await stored.destroy();

  const { token, user: userData } = signToken(user);
  res.json({ message: 'Login successful', token, user: userData });
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PROFILE (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, avatar } = req.body;

  const user = await User.findByPk(req.user.id);
  if (!user) throw notFound('User not found');

  if (name !== undefined) user.name = name;
  if (avatar !== undefined) user.avatar = avatar;
  await user.save();

  const { token, user: userData } = signToken(user);
  res.json({ message: 'Profile updated', token, user: userData });
});

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD — sends a link (not a code)
// ─────────────────────────────────────────────────────────────────────────────
const MAX_PASSWORD_RESETS = 3;

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw badRequest('Email is required');

  const user = await User.findOne({ where: { email } });
  if (!user) throw notFound('No account found with this email');

  if (user.passwordResets >= MAX_PASSWORD_RESETS) {
    throw forbidden('You have reached the maximum number of password resets. Please contact support.');
  }

  const token = crypto.randomBytes(32).toString('hex');
  await PasswordResetToken.destroy({ where: { email } });
  await PasswordResetToken.create({
    email,
    token,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  const resetUrl = `${frontendUrl()}/reset-password.html?token=${token}`;

  try {
    await emailService.sendPasswordResetLink(email, resetUrl);
  } catch (err) {
    logger.error('auth.reset-email.failed', { email, err: err.message });
    throw new AppError(502, 'Failed to send reset link. Please try again.');
  }

  const payload = { message: 'Reset link sent to your email', expiresIn: '30 minutes' };
  if (process.env.NODE_ENV !== 'production') {
    payload.devResetUrl = resetUrl;
    payload.devToken = token;
  }
  res.json(payload);
});

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD — accepts a token + new password (max 3 lifetime resets)
// ─────────────────────────────────────────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    throw badRequest('Token and new password are required');
  }

  const stored = await PasswordResetToken.findOne({
    where: { token, used: false },
    order: [['createdAt', 'DESC']],
  });
  if (!stored) throw badRequest('Invalid or already-used reset link');
  if (Date.now() > new Date(stored.expiresAt).getTime()) {
    await stored.destroy();
    throw badRequest('Reset link has expired. Please request a new one.');
  }

  const user = await User.findOne({ where: { email: stored.email } });
  if (!user) throw notFound('User not found');

  if (user.passwordResets >= MAX_PASSWORD_RESETS) {
    throw forbidden('You have reached the maximum number of password resets. Please contact support.');
  }

  user.password = await bcrypt.hash(password, 10);
  user.passwordResets = (user.passwordResets || 0) + 1;
  await user.save();

  await stored.destroy();

  const remaining = MAX_PASSWORD_RESETS - user.passwordResets;
  res.json({
    message: 'Password reset successful. You can now sign in with your new password.',
    passwordResetsRemaining: remaining,
  });
});

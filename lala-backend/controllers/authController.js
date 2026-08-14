const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Sequelize } = require('sequelize');

const emailService = require('../services/email');
const logger = require('../utils/logger');
const { asyncHandler, AppError, badRequest, notFound, conflict, forbidden } = require('../middleware/errorHandler');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes (kept from previous behavior)

// Only ever store/compare the hash of a reset code, never the plaintext.
function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function codeMatches(storedHash, code) {
  const a = Buffer.from(hashResetCode(code), 'utf8');
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

exports.register = asyncHandler(async (req, res) => {
  const { email, password, name, phone, role } = req.body;
  if (!email || !password) throw badRequest('Email and password are required');

  const safeRole = role === 'host' ? 'host' : 'guest';

  const existing = await User.findOne({ where: { email } });
  if (existing) throw badRequest('An account with this email already exists');

  const hashedPassword = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await User.create({ email, password: hashedPassword, name, phone, role: safeRole });
  } catch (err) {
    // Unique-constraint race between findOne and create → same friendly message
    if (err instanceof Sequelize.UniqueConstraintError) {
      throw conflict('An account with this email already exists');
    }
    throw err;
  }

  const { token, user: userData } = signToken(user);
  res.status(201).json({ message: 'Account created successfully', token, user: userData });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw badRequest('Email and password are required');

  const user = await User.findOne({ where: { email } });
  if (!user) throw badRequest('Invalid email or password');

  if (user.status === 'suspended') throw forbidden('Your account has been suspended. Contact support.');
  if (user.status === 'paused') throw forbidden('Your account is paused. Contact support to reactivate it.');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw badRequest('Invalid email or password');

  const { token, user: userData } = signToken(user);
  res.json({ message: 'Login successful', token, user: userData });
});

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

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw badRequest('Email is required');

  const user = await User.findOne({ where: { email } });
  if (!user) throw notFound('No account found with this email');

  const resetCode = crypto.randomInt(100000, 999999).toString();

  // Invalidate any previous outstanding tokens for this email, then persist the new one.
  await PasswordResetToken.destroy({ where: { email } });
  await PasswordResetToken.create({
    email,
    codeHash: hashResetCode(resetCode),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  // FLAG: if the email send fails below, the created token remains in the DB.
  // It is still valid for 30 min, so a retry via the SAME email destroys and
  // re-creates it — no orphan accumulation beyond one outstanding token.
  try {
    await emailService.sendPasswordResetCode(email, resetCode);
  } catch (err) {
    logger.error('auth.reset-email.failed', { email, err: err.message });
    throw new AppError(502, 'Failed to send reset code. Please try again.');
  }

  const payload = { message: 'Reset code sent to your email', expiresIn: '30 minutes' };
  // Dev convenience only: expose the code in non-production so local testing
  // doesn't depend on email delivery. NEVER returned in production.
  if (process.env.NODE_ENV !== 'production') {
    payload.resetCode = resetCode;
  }
  res.json(payload);
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) {
    throw badRequest('Email, code, and new password are required');
  }

  const stored = await PasswordResetToken.findOne({
    where: { email, used: false },
    order: [['createdAt', 'DESC']],
  });
  if (!stored) throw badRequest('No reset code requested for this email');
  if (Date.now() > new Date(stored.expiresAt).getTime()) {
    await stored.destroy();
    throw badRequest('Reset code has expired');
  }
  if (!codeMatches(stored.codeHash, code)) {
    throw badRequest('Invalid reset code');
  }

  const user = await User.findOne({ where: { email } });
  if (!user) throw notFound('User not found');

  user.password = await bcrypt.hash(password, 10);
  await user.save();

  // One-time use: consume the token after a successful reset.
  await stored.destroy();

  res.json({ message: 'Password reset successful. You can now log in with your new password.' });
});

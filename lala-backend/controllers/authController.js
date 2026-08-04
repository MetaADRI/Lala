const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');


const emailService = require('../services/email');

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
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  return { token, user: { id: user.id, email: user.email, role: user.role, name: user.name } };
}

exports.register = async (req, res) => {
  const { email, password, name, phone, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const safeRole = role === 'host' ? 'host' : 'guest';

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(400).json({ error: 'An account with this email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword, name, phone, role: safeRole });

    const { token, user: userData } = signToken(user);
    res.status(201).json({ message: 'Account created successfully', token, user: userData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid email or password' });

    const { token, user: userData } = signToken(user);
    res.json({ message: 'Login successful', token, user: userData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  const { name, avatar } = req.body;

  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (name !== undefined) user.name = name;
    if (avatar !== undefined) user.avatar = avatar;
    await user.save();

    const { token, user: userData } = signToken(user);
    res.json({ message: 'Profile updated', token, user: userData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.setupHost = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.name = name;
    user.role = 'host';
    await user.save();

    const { token, user: userData } = signToken(user);
    res.json({ message: 'Host profile created', token, user: userData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: 'No account found with this email' });

    const resetCode = crypto.randomInt(100000, 999999).toString();

    // Invalidate any previous outstanding tokens for this email, then persist the new one.
    await PasswordResetToken.destroy({ where: { email } });
    await PasswordResetToken.create({
      email,
      codeHash: hashResetCode(resetCode),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    await emailService.sendPasswordResetCode(email, resetCode);

    res.json({ message: 'Reset code sent to your email', expiresIn: '30 minutes' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) {
    return res.status(400).json({ error: 'Email, code, and new password are required' });
  }

  try {
    const stored = await PasswordResetToken.findOne({
      where: { email, used: false },
      order: [['createdAt', 'DESC']],
    });
    if (!stored) return res.status(400).json({ error: 'No reset code requested for this email' });
    if (Date.now() > new Date(stored.expiresAt).getTime()) {
      await stored.destroy();
      return res.status(400).json({ error: 'Reset code has expired' });
    }
    if (!codeMatches(stored.codeHash, code)) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    // One-time use: consume the token after a successful reset.
    await stored.destroy();

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

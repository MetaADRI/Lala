const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function signToken(user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET || 'lala_secret_key_2026',
    { expiresIn: '7d' }
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

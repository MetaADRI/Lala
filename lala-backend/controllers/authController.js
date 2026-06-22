const User = require('../models/User');
const jwt = require('jsonwebtoken');
const smsService = require('../services/smsService');

exports.requestOTP = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    let user = await User.findOne({ where: { phone } });
    if (!user) {
      user = await User.create({ phone });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    await user.save();

    // Send via SMS Service
    const smsResult = await smsService.sendOTP(phone, otp);

    if (smsResult.success) {
      res.json({ message: 'OTP sent successfully', phone, mockOtp: process.env.NODE_ENV === 'development' ? otp : undefined });
    } else {
      res.status(500).json({ error: 'Failed to send OTP' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.verifyOTP = async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

  try {
    const user = await User.findOne({ where: { phone, otp } });
    if (!user) return res.status(400).json({ error: 'Invalid OTP' });

    user.otp = null;
    user.isVerified = true;
    await user.save();

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      process.env.JWT_SECRET || 'lala_secret_key_2026',
      { expiresIn: '7d' }
    );

    res.json({ message: 'Verification successful', token, user: { id: user.id, phone: user.phone, role: user.role } });
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

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      process.env.JWT_SECRET || 'lala_secret_key_2026',
      { expiresIn: '7d' }
    );

    res.json({ message: 'Host profile created', token, user: { id: user.id, phone: user.phone, role: user.role, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

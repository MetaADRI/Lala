const User = require('../models/User');
const jwt = require('jsonwebtoken');

exports.requestOTP = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    let user = await User.findOne({ where: { phone } });
    if (!user) {
      user = await User.create({ phone });
    }

    // Mock OTP generation
    const otp = '123456'; 
    user.otp = otp;
    await user.save();

    res.json({ message: 'OTP sent successfully (Mock: 123456)', phone });
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

const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (ex) {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  // Load the user fresh from the DB so role/status changes (host approval,
  // suspension, pause) take effect immediately, and never trust the token alone.
  let user;
  try {
    user = await User.findByPk(decoded.id);
  } catch (ex) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  if (!user) {
    return res.status(401).json({ error: 'Account no longer exists.' });
  }
  if (user.status === 'suspended') {
    return res.status(401).json({ error: 'Your account has been suspended. Contact support.' });
  }
  if (user.status === 'paused') {
    return res.status(401).json({ error: 'Your account is paused. Contact support to reactivate it.' });
  }

  req.user = user;
  next();
};

const roleMiddleware = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Unauthorized role.' });
    }
    next();
  };
};

module.exports = { authMiddleware, roleMiddleware };

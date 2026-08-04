// models/PasswordResetToken.js
// Persisted password-reset tokens so they survive server restarts.
// Only the SHA-256 hash of the code is stored (never the plaintext code).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  codeHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'PasswordResetTokens',
  indexes: [
    { fields: ['email'] },
    { fields: ['expiresAt'] },
  ],
});

module.exports = PasswordResetToken;

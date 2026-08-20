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
  token: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
  },
  codeHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
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
    { fields: ['token'] },
    { fields: ['expiresAt'] },
  ],
});

module.exports = PasswordResetToken;

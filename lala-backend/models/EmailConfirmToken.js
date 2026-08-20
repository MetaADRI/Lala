const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmailConfirmToken = sequelize.define('EmailConfirmToken', {
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
    allowNull: false,
    unique: true,
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
  tableName: 'EmailConfirmTokens',
  indexes: [
    { fields: ['email'] },
    { fields: ['token'] },
    { fields: ['expiresAt'] },
  ],
});

module.exports = EmailConfirmToken;

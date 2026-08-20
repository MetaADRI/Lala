const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: 'guest'
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'paused'),
    defaultValue: 'active'
  },
  avatar: {
    type: DataTypes.STRING,
    allowNull: true
  },
  emailConfirmed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  passwordResets: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  }
});

module.exports = User;

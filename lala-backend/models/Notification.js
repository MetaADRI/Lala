const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

// In-app notification delivered to a single recipient user.
const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.STRING,
    allowNull: false
  },
  link: {
    type: DataTypes.STRING,
    allowNull: true // relative path the frontend can deep-link to
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = Notification;

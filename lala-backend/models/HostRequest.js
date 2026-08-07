const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

// A logged-in guest's application to become a host, reviewed by an admin.
const HostRequest = sequelize.define('HostRequest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending' // pending | approved | rejected
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

HostRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = HostRequest;

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
  propertyNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  nationalIdNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  idDocumentPhoto: {
    type: DataTypes.STRING,
    allowNull: true // Cloudinary URL
  },
  proofOfOwnershipDocument: {
    type: DataTypes.STRING,
    allowNull: true // Cloudinary URL
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending' // pending | approved | rejected
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reviewedBy: {
    type: DataTypes.UUID,
    allowNull: true // id of the admin who decided
  },
  rejectionReason: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

HostRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = HostRequest;

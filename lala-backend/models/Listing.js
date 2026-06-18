const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Listing = sequelize.define('Listing', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING, // e.g., 'Guesthouse', 'Lodge', 'Hostel'
    allowNull: false
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false
  },
  district: {
    type: DataTypes.STRING,
    allowNull: false
  },
  price: {
    type: DataTypes.FLOAT, // ZMW
    allowNull: false
  },
  photos: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  amenities: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  isApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hostId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  hostPhone: {
    type: DataTypes.STRING,
    allowNull: true  // Populated from host user record at listing creation
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

module.exports = Listing;

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
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      const val = this.getDataValue('photos');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('photos', JSON.stringify(val));
    }
  },
  amenities: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      const val = this.getDataValue('amenities');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('amenities', JSON.stringify(val));
    }
  },
  isApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hostId: {
    type: DataTypes.UUID,
    allowNull: false
  }
});

module.exports = Listing;

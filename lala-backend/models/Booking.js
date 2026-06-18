const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  listingId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  guestId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  checkIn: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  checkOut: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  },
  totalAmount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: true  // 'MTN', 'Airtel', 'Zamtel'
  },
  guestPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  transactionRef: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

module.exports = Booking;

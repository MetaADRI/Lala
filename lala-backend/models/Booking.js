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
  },
  // --- Lenco payment fields ---
  lencoReference: {
    type: DataTypes.STRING,
    allowNull: true, // Lenco's internal reference (lencoReference from the API)
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'pay-offline', 'successful', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
  },
});

module.exports = Booking;

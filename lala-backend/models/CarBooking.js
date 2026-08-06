const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CarBooking = sequelize.define('CarBooking', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  carId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  guestId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tripType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  pickupLocation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  dropoffLocation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  pickupDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  pickupTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  flightNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  passengerCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  totalAmount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  },
  guestPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: true  // 'MTN', 'Airtel', 'Zamtel'
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
  // --- Lenco split-settlement fields ---
    driverStatus:       { type: DataTypes.ENUM('pending','paid','failed','skipped'), allowNull: false, defaultValue: 'pending' },
    driverRef:          { type: DataTypes.STRING, allowNull: true },
    driverPayoutAmount: { type: DataTypes.FLOAT,  allowNull: true },
    commissionAmount:   { type: DataTypes.FLOAT,  allowNull: true }, // 10% commission amount
    commissionStatus:   { type: DataTypes.ENUM('pending','paid','failed','skipped'), allowNull: false, defaultValue: 'pending' },
    commissionRef:      { type: DataTypes.STRING, allowNull: true }, // Lenco ref for the commission payout
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

module.exports = CarBooking;

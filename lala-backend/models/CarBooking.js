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
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

module.exports = CarBooking;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Car = sequelize.define('Car', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  driverName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  driverPhone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  model: {
    type: DataTypes.STRING,
    allowNull: false
  },
  plateNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  seats: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  pricePerKm: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  airportPrice: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  photos: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  hostId: {
    type: DataTypes.UUID,
    allowNull: false
  }
});

module.exports = Car;

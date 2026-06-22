const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Listing = require('./Listing');

const SavedListing = sequelize.define('SavedListing', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  listingId: {
    type: DataTypes.UUID,
    allowNull: false
  }
});

SavedListing.belongsTo(Listing, { foreignKey: 'listingId' });

module.exports = SavedListing;

'use strict';

// In-app notifications: a single row per notification, targeted at one user
// (recipient). `type` mirrors the app domain (host_approved, host_rejected,
// booking_confirmed, booking_cancelled...). `link` is an optional relative
// path the frontend can deep-link to (e.g. 'my-bookings.html'). `readAt` is
// null until the recipient opens/reads it.

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('Notifications', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      message: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      link: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('Notifications', ['userId']);
    await queryInterface.addIndex('Notifications', ['readAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Notifications');
  },
};

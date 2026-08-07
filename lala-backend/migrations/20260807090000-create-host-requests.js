'use strict';

// Host applications ("Become a Host"): a logged-in guest requests host status,
// an admin approves/rejects it. A separate table keeps the audit trail of who
// applied, when, and the outcome — the Users table itself is untouched until
// an application is approved.

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('HostRequests', {
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
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending', // pending | approved | rejected
      },
      reviewedAt: {
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
    await queryInterface.addIndex('HostRequests', ['userId']);
    await queryInterface.addIndex('HostRequests', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('HostRequests');
  },
};

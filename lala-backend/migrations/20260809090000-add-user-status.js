'use strict';

// User account status: every account is 'active' by default. Admins can
// suspend (blocked, kept in system) or pause (temporarily deactivated) an
// account. Suspended/paused users cannot log in or call authenticated routes.

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('Users', 'status', {
      type: DataTypes.ENUM('active', 'suspended', 'paused'),
      allowNull: false,
      defaultValue: 'active',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Users', 'status');
  },
};

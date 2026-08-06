'use strict';

// Add Lenco payment + split-settlement columns to CarBookings so car/airport
// transfers follow the same guest-paid flow as lodge bookings:
//   - paymentStatus tracks the Lenco collection (pending → successful/failed)
//   - driverStatus/driverPayoutAmount track the driver payout (full price)
//   - commissionStatus/commissionAmount track Lala's 10% service fee

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('CarBookings', 'provider', {
      type: DataTypes.STRING,
      allowNull: true, // 'MTN', 'Airtel', 'Zamtel'
    });
    await queryInterface.addColumn('CarBookings', 'transactionRef', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('CarBookings', 'lencoReference', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('CarBookings', 'paymentStatus', {
      type: DataTypes.ENUM('pending', 'pay-offline', 'successful', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    });
    await queryInterface.addColumn('CarBookings', 'driverStatus', {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'skipped'),
      allowNull: false,
      defaultValue: 'pending',
    });
    await queryInterface.addColumn('CarBookings', 'driverRef', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('CarBookings', 'driverPayoutAmount', {
      type: DataTypes.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('CarBookings', 'commissionAmount', {
      type: DataTypes.FLOAT,
      allowNull: true, // 10% commission amount
    });
    await queryInterface.addColumn('CarBookings', 'commissionStatus', {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'skipped'),
      allowNull: false,
      defaultValue: 'pending',
    });
    await queryInterface.addColumn('CarBookings', 'commissionRef', {
      type: DataTypes.STRING,
      allowNull: true, // Lenco ref for the commission payout
    });
  },

  async down(queryInterface) {
    const columns = [
      'provider',
      'transactionRef',
      'lencoReference',
      'paymentStatus',
      'driverStatus',
      'driverRef',
      'driverPayoutAmount',
      'commissionAmount',
      'commissionStatus',
      'commissionRef',
    ];
    for (const column of columns) {
      await queryInterface.removeColumn('CarBookings', column);
    }
  },
};

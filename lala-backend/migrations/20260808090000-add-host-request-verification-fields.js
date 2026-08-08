'use strict';

// Host-verification fields for "Become a Host" applications. Admins need more
// than a name + phone to vet an applicant:
//   - propertyNumber / nationalIdNumber: identifying details for the property + person
//   - idDocumentPhoto / proofOfOwnershipDocument: Cloudinary URLs from /api/upload
//   - reviewedBy / rejectionReason: audit trail of who decided and why

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('HostRequests', 'propertyNumber', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('HostRequests', 'nationalIdNumber', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('HostRequests', 'idDocumentPhoto', {
      type: DataTypes.STRING,
      allowNull: true, // Cloudinary URL
    });
    await queryInterface.addColumn('HostRequests', 'proofOfOwnershipDocument', {
      type: DataTypes.STRING,
      allowNull: true, // Cloudinary URL
    });
    await queryInterface.addColumn('HostRequests', 'reviewedBy', {
      type: DataTypes.UUID,
      allowNull: true, // id of the admin who decided
    });
    await queryInterface.addColumn('HostRequests', 'rejectionReason', {
      type: DataTypes.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const columns = [
      'propertyNumber',
      'nationalIdNumber',
      'idDocumentPhoto',
      'proofOfOwnershipDocument',
      'reviewedBy',
      'rejectionReason',
    ];
    for (const column of columns) {
      await queryInterface.removeColumn('HostRequests', column);
    }
  },
};

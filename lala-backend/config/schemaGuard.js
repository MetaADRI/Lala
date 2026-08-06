// config/schemaGuard.js
// Idempotent, additive-only schema guards applied at boot AFTER plain sync().
//
// The bookings_no_overlap EXCLUDE constraint is the database-level guarantee
// against double-booking (two non-cancelled bookings for the same listing with
// overlapping [checkIn, checkOut)). It is also shipped as a real migration
// (migrations/*-add-booking-no-overlap-constraint.js); this boot-time guard is
// belt-and-braces so a fresh deployment that forgets `npm run migrate` still
// gets the constraint — WITHOUT ever dropping or altering existing data.
//
// Deliberately additive-only: never alters existing columns, never drops.
const sequelize = require('./database');
const logger = require('../utils/logger');

const OVERLAP_CONSTRAINT_NAME = 'bookings_no_overlap';

async function hasExistingOverlaps() {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS n
       FROM "Bookings" a
       JOIN "Bookings" b
         ON a."listingId" = b."listingId"
        AND a.id < b.id
        AND a."status" <> 'cancelled'
        AND b."status" <> 'cancelled'
        AND daterange(a."checkIn", a."checkOut", '[)') && daterange(b."checkIn", b."checkOut", '[)')`
  );
  return Number(rows[0]?.n || 0);
}

async function ensureBookingOverlapConstraint() {
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist');

  const [rows] = await sequelize.query(
    `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${OVERLAP_CONSTRAINT_NAME}') AS exists`
  );
  if (rows[0]?.exists) {
    logger.info('schema.constraint.present', { constraint: OVERLAP_CONSTRAINT_NAME });
    return;
  }

  const overlaps = await hasExistingOverlaps();
  if (overlaps > 0) {
    // Never block boot, but refuse to apply the constraint while the data is
    // dirty — the ALTER would fail mid-startup. Resolve the overlaps and run
    // `npm run migrate` (that migration fails loudly) or re-deploy.
    logger.warn('schema.constraint.skipped', {
      constraint: OVERLAP_CONSTRAINT_NAME,
      reason: `${overlaps} overlapping non-cancelled booking pair(s) found — resolve them, then run the migration`,
    });
    return;
  }

  await sequelize.query(
    `ALTER TABLE "Bookings"
       ADD CONSTRAINT "${OVERLAP_CONSTRAINT_NAME}"
       EXCLUDE USING gist (
         "listingId" WITH =,
         daterange("checkIn", "checkOut", '[)') WITH &&
       )
       WHERE ("status" <> 'cancelled')`
  );
  logger.info('schema.constraint.added', { constraint: OVERLAP_CONSTRAINT_NAME });
}

module.exports = { ensureBookingOverlapConstraint, OVERLAP_CONSTRAINT_NAME };

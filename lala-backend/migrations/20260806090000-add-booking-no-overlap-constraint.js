'use strict';

// Database-level double-booking guard for accommodations.
//
// Adds a partial EXCLUDE constraint so PostgreSQL itself rejects two
// non-cancelled bookings for the same listing with overlapping
// [checkIn, checkOut) ranges — the authoritative protection against the
// application-level check-then-insert race in createBooking.
//
// Requires the btree_gist extension (supported on Neon).

const constraintName = 'bookings_no_overlap';

module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize.query.bind(queryInterface.sequelize);

    // Idempotent — the boot-time schema guard (config/schemaGuard.js) may
    // already have applied this on a fresh deploy.
    const [rows] = await sql(
      `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') AS exists`
    );
    if (rows[0]?.exists) return;

    await sql('CREATE EXTENSION IF NOT EXISTS btree_gist');

    // Fail loudly (not with a cryptic ALTER error) if existing data already
    // violates the constraint. The operator must resolve overlaps first.
    const [overlaps] = await sql(
      `SELECT a.id AS a_id, b.id AS b_id, a."listingId"
         FROM "Bookings" a
         JOIN "Bookings" b
           ON a."listingId" = b."listingId"
          AND a.id < b.id
          AND a."status" <> 'cancelled'
          AND b."status" <> 'cancelled'
          AND daterange(a."checkIn", a."checkOut", '[)') && daterange(b."checkIn", b."checkOut", '[)')
        LIMIT 20`
    );
    if (overlaps.length > 0) {
      throw new Error(
        `Cannot add ${constraintName}: existing overlapping non-cancelled bookings found ` +
          `(${overlaps.length} shown). Resolve overlaps (cancel or adjust dates) before ` +
          `running this migration.`
      );
    }

    await sql(
      `ALTER TABLE "Bookings"
         ADD CONSTRAINT "${constraintName}"
         EXCLUDE USING gist (
           "listingId" WITH =,
           daterange("checkIn", "checkOut", '[)') WITH &&
         )
         WHERE ("status" <> 'cancelled')`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "Bookings" DROP CONSTRAINT IF EXISTS "${constraintName}"`
    );
  },
};

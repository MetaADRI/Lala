# Migrations

This project now uses **Sequelize migrations** for schema changes. The app no
longer runs `sync({ alter: true })` against production (see below).

## Why

`sequelize.sync({ alter: true })` derives schema from the JS models and mutates
the live database on every boot. That is risky against a production database:

- an accidental `{ force: true }` **drops** tables;
- `{ alter: true }` can produce destructive/blocking DDL (`ALTER TABLE`,
  rewrites, index churn) with no review, no rollback, and no record of what
  changed;
- two deploys running different model definitions can fight over the schema.

Server startup now uses plain `sync()` — create missing tables on a fresh
database only, never alter/drop existing ones. All schema changes ship as
migrations.

## Workflow

```bash
# Run pending migrations (local or in the Render shell / release command)
npm run migrate

# Generate a new migration scaffold
npm run migration:generate -- my-migration-name

# Undo the last migration (dev only)
npm run migrate:undo
```

For Render: add `npm run migrate` to the **Deploy → Build / Release command**
so migrations apply before the new release boots.

## Notes

- `config/sequelizeConfig.js` loads `.env` itself (the CLI does not), and both
  environments use `DATABASE_URL`.
- Migrations are the source of truth for schema changes. If a model changes,
  ship a migration for it — do not rely on `sync({ alter: true })`.
- `config/schemaGuard.js` applies the `bookings_no_overlap` EXCLUDE constraint
  idempotently at boot as belt-and-braces; the migration is the canonical record.

## Existing migration

- `20260806090000-add-booking-no-overlap-constraint.js`
  - `CREATE EXTENSION IF NOT EXISTS btree_gist`
  - partial `EXCLUDE USING gist (listingId WITH =, daterange(checkIn, checkOut, '[)') WITH &&) WHERE (status <> 'cancelled')`
  - fails loudly if pre-existing overlapping non-cancelled bookings exist

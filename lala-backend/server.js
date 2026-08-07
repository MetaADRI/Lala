require('dotenv').config();

// Fail fast: abort before anything else if required env vars are missing.
const { validateEnv } = require('./config/envValidation');
validateEnv();

const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/database');
const logger = require('./utils/logger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { ensureBookingOverlapConstraint } = require('./config/schemaGuard');

const authRoutes = require('./routes/authRoutes');
const listingRoutes = require('./routes/listingRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const savedListingRoutes = require('./routes/savedListingRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const carRoutes = require('./routes/carRoutes');
const carBookingRoutes = require('./routes/carBookingRoutes');
const hostRequestRoutes = require('./routes/hostRequestRoutes');

// Models (ensure they're loaded for associations)
require('./models/Listing');
require('./models/SavedListing');
require('./models/Car');
require('./models/CarBooking');
require('./models/PasswordResetToken');
require('./models/HostRequest');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());

// RAW body ONLY for the Lenco webhooks (must come BEFORE express.json)
app.use('/api/bookings/webhook', express.raw({ type: 'application/json' }));
app.use('/api/car-bookings/webhook', express.raw({ type: 'application/json' }));

// JSON parser for everything else
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/saved-listings', savedListingRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/car-bookings', carBookingRoutes);
app.use('/api/host-requests', hostRequestRoutes);

// Health check
app.get('/', (req, res) => {
  res.send('Lala Backend API is running...');
});

// 404 + centralized error handler (registered last, after all routes)
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  // Plain sync() ONLY: creates missing tables on a fresh database, and never
  // alters or drops existing columns/constraints against production.
  // Schema changes MUST go through migrations (`npm run migrate`) —
  // see migrations/README.md. sync({ alter: true }) / sync({ force: true })
  // are deliberately NOT used here.
  await sequelize.sync();
  logger.info('db.synced', { mode: 'sync (create-if-missing only)' });

  // Additive, idempotent DB-level guard against double-booking (see migration).
  await ensureBookingOverlapConstraint();

  app.listen(PORT, () => {
    logger.info('server.start', { port: PORT });
  });
}

start().catch((err) => {
  logger.error('server.start.failed', { err: err.message, stack: err.stack });
  process.exit(1);
});

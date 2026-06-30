require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/database');

const authRoutes = require('./routes/authRoutes');
const listingRoutes = require('./routes/listingRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const savedListingRoutes = require('./routes/savedListingRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const carRoutes = require('./routes/carRoutes');
const carBookingRoutes = require('./routes/carBookingRoutes');

// Models (ensure they're loaded for associations)
require('./models/Listing');
require('./models/SavedListing');
require('./models/Car');
require('./models/CarBooking');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());

// RAW body ONLY for the Lenco webhook (must come BEFORE express.json)
app.use('/api/bookings/webhook', express.raw({ type: 'application/json' }));

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

// Health check
app.get('/', (req, res) => {
  res.send('Lala Backend API is running...');
});

// Database Sync & Start Server
sequelize.sync({ alter: true })
  .then(() => {
    console.log('✓ Database synced successfully');
    app.listen(PORT, () => {
      console.log(`✓ Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('✗ Unable to sync database:', err.message);
  });

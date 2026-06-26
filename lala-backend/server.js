const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/database');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const listingRoutes = require('./routes/listingRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const savedListingRoutes = require('./routes/savedListingRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

// Models (ensure they're loaded for associations)
require('./models/Listing');
require('./models/SavedListing');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
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

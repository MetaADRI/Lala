const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// IMPORTANT: Specific named routes MUST come before /:id to avoid conflicts
router.get('/guest/all', authMiddleware, bookingController.getGuestBookings);
router.get('/host/all', authMiddleware, roleMiddleware(['host', 'admin']), bookingController.getHostBookings);

router.post('/', authMiddleware, bookingController.createBooking);
router.get('/:id', authMiddleware, bookingController.getBookingDetails);
router.post('/:id/confirm', authMiddleware, bookingController.confirmBooking);

// Deprecated — kept so old clients don't 404
router.post('/pay', authMiddleware, bookingController.initiatePayment);

module.exports = router;

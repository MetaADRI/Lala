const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.post('/', authMiddleware, bookingController.createBooking);
router.get('/:id', authMiddleware, bookingController.getBookingDetails);
router.post('/pay', authMiddleware, bookingController.initiatePayment);
router.get('/host/all', authMiddleware, roleMiddleware(['host', 'admin']), bookingController.getHostBookings);

module.exports = router;

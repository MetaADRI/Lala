const express = require('express');
const router = express.Router();
const carBookingController = require('../controllers/carBookingController');
const { authMiddleware } = require('../middleware/auth');

router.post('/', authMiddleware, carBookingController.createCarBooking);
router.get('/guest/all', authMiddleware, carBookingController.getGuestCarBookings);
router.get('/driver/all', authMiddleware, carBookingController.getDriverCarBookings);
router.patch('/:id/status', authMiddleware, carBookingController.updateCarBookingStatus);
router.post('/:id/cancel', authMiddleware, carBookingController.cancelCarBooking);

module.exports = router;

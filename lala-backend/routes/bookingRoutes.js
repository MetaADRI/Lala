const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const Booking = require('../models/Booking');
const paymentService = require('../services/paymentService');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// IMPORTANT: Specific named routes MUST come before /:id to avoid conflicts
router.get('/guest/all', authMiddleware, bookingController.getGuestBookings);
router.get('/host/all', authMiddleware, roleMiddleware(['host', 'admin']), bookingController.getHostBookings);
router.get('/admin/all', authMiddleware, roleMiddleware(['admin']), bookingController.getAllBookings);

router.post('/', authMiddleware, bookingController.createBooking);
router.get('/:id', authMiddleware, bookingController.getBookingDetails);
router.get('/:id/status', bookingController.getBookingPaymentStatus);
router.post('/:id/cancel', authMiddleware, bookingController.cancelBooking);
router.post('/:id/host-cancel', authMiddleware, roleMiddleware(['host', 'admin']), bookingController.hostCancelBooking);

// Lenco webhook (no auth middleware — verified by signature instead)
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.header('x-lenco-signature');
    const isValid = paymentService.verifyWebhookSignature(req.body, signature);
    if (!isValid) {
      console.warn('[webhook] invalid signature — rejected');
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(req.body.toString('utf8'));
    const { event: eventType, data } = event;
    const reference = data?.reference;

    if (reference) {
      const booking = await Booking.findOne({ where: { transactionRef: reference } });
      if (booking) {
        if (eventType === 'collection.successful') {
          if (booking.status !== 'confirmed') {
            await bookingController.confirmBooking(booking);
          }
        } else if (eventType === 'collection.failed') {
          booking.paymentStatus = 'failed';
          await booking.save();
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('[webhook] error:', err.message);
    return res.sendStatus(200);
  }
});

// Deprecated — kept so old clients don't 404
router.post('/pay', authMiddleware, bookingController.initiatePayment);

module.exports = router;

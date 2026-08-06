const express = require('express');
const router = express.Router();
const carBookingController = require('../controllers/carBookingController');
const CarBooking = require('../models/CarBooking');
const paymentService = require('../services/paymentService');
const settlementService = require('../services/settlementService');
const logger = require('../utils/logger');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { asyncHandler, notFound } = require('../middleware/errorHandler');

// IMPORTANT: Specific named routes MUST come before /:id to avoid conflicts
router.get('/guest/all', authMiddleware, carBookingController.getGuestCarBookings);
router.get('/driver/all', authMiddleware, carBookingController.getDriverCarBookings);

router.post('/', authMiddleware, carBookingController.createCarBooking);
router.get('/:id/status', carBookingController.getCarBookingPaymentStatus);
router.patch('/:id/status', authMiddleware, carBookingController.updateCarBookingStatus);
router.post('/:id/cancel', authMiddleware, carBookingController.cancelCarBooking);

// View settlement state (admin/driver only — commission hidden from guests)
router.get('/:id/settlement-status', authMiddleware, roleMiddleware(['admin', 'host']), asyncHandler(async (req, res) => {
  const booking = await CarBooking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');
  return res.json({
    driverStatus: booking.driverStatus,
    driverRef: booking.driverRef,
    driverPayoutAmount: booking.driverPayoutAmount,
    commissionAmount: booking.commissionAmount,
    commissionStatus: booking.commissionStatus,
    commissionRef: booking.commissionRef,
  });
}));

// Retry failed/skipped driver and/or commission payouts (admin only)
router.post('/:id/retry-payout', authMiddleware, roleMiddleware(['admin']), asyncHandler(async (req, res) => {
  const booking = await CarBooking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');

  const driverNeedsRetry = ['failed', 'skipped', 'pending'].includes(booking.driverStatus);
  const commissionNeedsRetry = ['failed', 'skipped', 'pending'].includes(booking.commissionStatus);

  if (!driverNeedsRetry && !commissionNeedsRetry) {
    return res.status(400).json({
      error: `Nothing to retry (driverStatus=${booking.driverStatus}, commissionStatus=${booking.commissionStatus})`,
    });
  }

  // Allow re-attempt: reset skipped/failed so settleCarBooking will try again
  if (driverNeedsRetry && booking.driverStatus !== 'pending') {
    booking.driverStatus = 'pending';
  }
  if (commissionNeedsRetry && booking.commissionStatus !== 'pending') {
    booking.commissionStatus = 'pending';
  }
  await booking.save();

  logger.info('car.settle.retry.started', { bookingId: booking.id, by: req.user?.id });

  await settlementService.settleCarBooking(booking);
  await booking.reload();

  logger.info('car.settle.retry.done', {
    bookingId: booking.id,
    driverStatus: booking.driverStatus,
    commissionStatus: booking.commissionStatus,
  });

  return res.json({
    driverStatus: booking.driverStatus,
    driverRef: booking.driverRef,
    driverPayoutAmount: booking.driverPayoutAmount,
    commissionStatus: booking.commissionStatus,
    commissionRef: booking.commissionRef,
    commissionAmount: booking.commissionAmount,
  });
}));

// Lenco webhook (no auth middleware — verified by signature instead)
router.post('/webhook', async (req, res) => {
  const signature = req.header('x-lenco-signature');
  const isValid = paymentService.verifyWebhookSignature(req.body, signature);
  if (!isValid) {
    logger.warn('car.webhook.rejected', { reason: 'invalid signature' });
    return res.status(401).send('Invalid signature');
  }

  let eventType = null;
  let reference = null;

  // Unparsable body: acknowledge (Lenco should not retry garbage) but trace it.
  try {
    const event = JSON.parse(req.body.toString('utf8'));
    eventType = event?.event;
    reference = event?.data?.reference;
  } catch (err) {
    logger.error('car.webhook.unparsable', { err: err.message });
    return res.sendStatus(200);
  }

  logger.info('car.webhook.received', { eventType, reference });

  try {
    if (reference) {
      const booking = await CarBooking.findOne({ where: { transactionRef: reference } });
      if (booking) {
        if (eventType === 'collection.successful') {
          if (booking.status !== 'confirmed') {
            await carBookingController.confirmCarBooking(booking);
          }
          logger.info('car.webhook.confirmed', { bookingId: booking.id, reference });
        } else if (eventType === 'collection.failed') {
          booking.paymentStatus = 'failed';
          await booking.save();
          logger.info('car.webhook.failed', { bookingId: booking.id, reference });
        } else {
          logger.info('car.webhook.ignored', { eventType, reference });
        }
      } else {
        logger.warn('car.webhook.no-booking', { reference });
      }
    } else {
      logger.warn('car.webhook.no-reference', { eventType });
    }

    return res.sendStatus(200);
  } catch (err) {
    // FLAG (same as lodge webhook): returning 200 here means Lenco will NOT
    // retry the event. Deliberately unchanged this pass — the status poll
    // reconciles success, and admin retry-payout covers settlement.
    logger.error('car.webhook.process-failed', {
      eventType,
      reference,
      err: err.message,
      stack: err.stack,
    });
    return res.sendStatus(200);
  }
});

module.exports = router;

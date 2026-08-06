const crypto = require('crypto');
const { Op } = require('sequelize');
const CarBooking = require('../models/CarBooking');
const Car = require('../models/Car');
const paymentService = require('../services/paymentService');
const smsService = require('../services/smsService');
const logger = require('../utils/logger');
const {
  AppError,
  asyncHandler,
  badRequest,
  notFound,
  forbidden,
} = require('../middleware/errorHandler');

const VALID_OPERATORS = ['mtn', 'airtel', 'zamtel'];
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// A transfer can only move into these states once Lenco has verified the guest
// payment. The rest of the driver trip flow stays free-form
// (e.g. pending → confirmed → completed).
const PAYMENT_GATED_STATUSES = ['confirmed', 'completed', 'paid'];

/**
 * POST /api/car-bookings
 * Create a transfer (awaiting_payment) then trigger the Lenco USSD push.
 *
 * Guest pays transfer price + 10% service fee (same as lodges), e.g. K90 + K9 = K99.
 * The push happens AFTER the insert so we never hold a DB write across the
 * 30-second external network call.
 */
exports.createCarBooking = asyncHandler(async (req, res) => {
  const {
    carId, tripType, pickupLocation, dropoffLocation, pickupDate, pickupTime,
    passengerCount, provider, phone, guestPhone, notes,
  } = req.body;
  if (!carId || !tripType || !pickupLocation || !dropoffLocation || !pickupDate || !pickupTime) {
    throw badRequest('Missing required fields');
  }
  if (!provider || (!phone && !guestPhone)) {
    throw badRequest('provider and phone are required for payment');
  }
  const operator = String(provider).toLowerCase();
  if (!VALID_OPERATORS.includes(operator)) {
    throw badRequest('provider must be mtn, airtel or zamtel');
  }

  const car = await Car.findByPk(carId);
  if (!car) throw notFound('Car not found');

  const price = tripType === 'airport' ? car.airportPrice : car.pricePerKm;
  if (!price || Number(price) <= 0) {
    throw badRequest('This vehicle has no price configured for the selected trip type');
  }

  // Guest pays transfer price + 10% service fee. Must match the transfer-payment UI.
  const serviceFeeRate = Number(process.env.LENCO_COMMISSION_RATE || 0.10);
  const totalAmount = round2(Number(price) * (1 + serviceFeeRate));
  const reference = `lala-car-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const payerPhone = phone || guestPhone;

  const booking = await CarBooking.create({
    carId,
    guestId: req.user.id,
    tripType,
    pickupLocation,
    dropoffLocation,
    pickupDate,
    pickupTime,
    flightNumber: req.body.flightNumber || null,
    passengerCount: passengerCount || 1,
    totalAmount,
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    provider: operator,
    guestPhone: payerPhone,
    transactionRef: reference,
    notes,
  });

  // Payment push AFTER insert — never hold the row across the Lenco call.
  let lencoData;
  try {
    lencoData = await paymentService.initiateMomoPush({
      amount: totalAmount,
      reference,
      phone: payerPhone,
      operator,
    });
  } catch (err) {
    // Money not yet collected. The booking is kept (awaiting_payment) so the
    // dates/trip stay reserved and the guest can retry — do NOT roll it back.
    logger.error('car.payment.push.failed', {
      bookingId: booking.id,
      reference,
      amount: totalAmount,
      operator,
      err: err.message,
    });
    throw new AppError(502, 'Payment push failed. Please try again.');
  }

  booking.lencoReference = lencoData.lencoReference;
  booking.paymentStatus = lencoData.status;
  await booking.save();

  logger.info('car.payment.push.initiated', {
    bookingId: booking.id,
    reference,
    amount: totalAmount,
    operator,
    paymentStatus: booking.paymentStatus,
  });

  return res.status(201).json({
    bookingId: booking.id,
    reference,
    paymentStatus: booking.paymentStatus,
    message: 'Approve the payment on your phone.',
  });
});

/**
 * GET /api/car-bookings/:id/status
 * Frontend polls this from the USSD-waiting screen (same shape as lodges).
 */
exports.getCarBookingPaymentStatus = asyncHandler(async (req, res) => {
  const booking = await CarBooking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');

  if (['successful', 'failed'].includes(booking.paymentStatus)) {
    logger.info('car.payment.poll.terminal', {
      bookingId: booking.id,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
    });
    return res.json({ paymentStatus: booking.paymentStatus, status: booking.status });
  }

  // No Lenco reference to poll (legacy record) — surface the stored state.
  if (!booking.transactionRef) {
    logger.warn('car.payment.poll.no-ref', { bookingId: booking.id });
    return res.json({ paymentStatus: booking.paymentStatus, status: booking.status });
  }

  const lencoData = await paymentService.verifyCollectionStatus(booking.transactionRef);
  const previousStatus = booking.paymentStatus;
  booking.paymentStatus = lencoData.status;

  logger.info('car.payment.poll.status', {
    bookingId: booking.id,
    transactionRef: booking.transactionRef,
    previousStatus,
    lencoStatus: lencoData.status,
    bookingStatus: booking.status,
  });

  if (lencoData.status === 'successful' && booking.status !== 'confirmed') {
    await confirmCarBooking(booking);
  } else {
    await booking.save();
  }

  return res.json({ paymentStatus: booking.paymentStatus, status: booking.status });
});

/**
 * Internal: confirm a transfer, send SMS, and settle.
 * Called ONLY after Lenco confirms 'successful' (via poll or webhook).
 *
 * Concurrency guard: the status flip is an atomic compare-and-set
 * (UPDATE ... WHERE status != 'confirmed'). If a webhook and the status poll
 * race, only ONE caller wins the flip and proceeds to settle — preventing a
 * double payout of the driver or commission transfer.
 */
async function confirmCarBooking(booking) {
  const [affected] = await CarBooking.update(
    { status: 'confirmed', paymentStatus: 'successful' },
    { where: { id: booking.id, status: { [Op.ne]: 'confirmed' } } }
  );

  if (affected === 0) {
    logger.warn('car.confirm.skipped', {
      bookingId: booking.id,
      reason: 'already confirmed by another request',
    });
    return booking;
  }

  booking.status = 'confirmed';
  booking.paymentStatus = 'successful';
  logger.info('car.confirmed', { bookingId: booking.id });

  // SMS — failure never blocks confirmation or settlement
  try { await smsService.sendCarBookingConfirmation(booking); }
  catch (e) { logger.warn('car.sms.failed', { bookingId: booking.id, err: e.message }); }

  // Settle: 100% of price to driver + 10% commission to operator wallet. Crash-safe — won't throw.
  await require('../services/settlementService').settleCarBooking(booking);

  return booking;
}

/** Strip settlement/commission fields so guests never see the 10% split. */
function publicCarBookingFields(bookingJson, role) {
  if (role === 'admin') return bookingJson;
  const {
    commissionAmount,
    commissionStatus,
    commissionRef,
    driverStatus,
    driverRef,
    driverPayoutAmount,
    ...safe
  } = bookingJson;
  // Drivers (hosts) may see their own payout status, not Lala commission
  if (role === 'host') {
    return { ...safe, driverStatus, driverRef, driverPayoutAmount };
  }
  return safe;
}

exports.getGuestCarBookings = asyncHandler(async (req, res) => {
  const bookings = await CarBooking.findAll({
    where: { guestId: req.user.id },
    order: [['createdAt', 'DESC']]
  });
  const carIds = [...new Set(bookings.map(b => b.carId))];
  const cars = await Car.findAll({ where: { id: carIds }, attributes: ['id', 'model', 'driverName', 'driverPhone'] });
  const carMap = Object.fromEntries(cars.map(c => [c.id, c]));
  res.json(bookings.map(b => ({ ...publicCarBookingFields(b.toJSON(), 'guest'), car: carMap[b.carId] || null })));
});

exports.getDriverCarBookings = asyncHandler(async (req, res) => {
  const cars = await Car.findAll({ where: { hostId: req.user.id }, attributes: ['id'] });
  const carIds = cars.map(c => c.id);

  const bookings = await CarBooking.findAll({
    where: { carId: carIds },
    order: [['createdAt', 'DESC']]
  });
  const allCars = await Car.findAll({ where: { id: carIds }, attributes: ['id', 'model', 'driverName'] });
  const carMap = Object.fromEntries(allCars.map(c => [c.id, c]));
  res.json(bookings.map(b => ({ ...publicCarBookingFields(b.toJSON(), 'host'), car: carMap[b.carId] || null })));
});

/**
 * PATCH /api/car-bookings/:id/status
 * Driver manual status flow for the trip. A transfer can NOT be moved into a
 * paid/completed state until Lenco has verified the guest payment.
 */
exports.updateCarBookingStatus = asyncHandler(async (req, res) => {
  const booking = await CarBooking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');

  const car = await Car.findByPk(booking.carId);
  if (!car) throw notFound('Car not found');
  if (car.hostId !== req.user.id && req.user.role !== 'admin') throw forbidden('Access denied');

  const next = req.body.status;
  if (!next || typeof next !== 'string') throw badRequest('status is required');
  if (next === 'awaiting_payment') throw badRequest('Invalid status');

  // Money has to move before the trip is treated as done/accepted.
  if (PAYMENT_GATED_STATUSES.includes(next) && booking.paymentStatus !== 'successful') {
    throw new AppError(402, 'Payment must be verified before this status change.');
  }

  booking.status = next;
  await booking.save();
  res.json({ message: 'Booking updated', booking });
});

/**
 * POST /api/car-bookings/:id/cancel
 * Guest cancels their own transfer (only if not yet paid).
 */
exports.cancelCarBooking = asyncHandler(async (req, res) => {
  const booking = await CarBooking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');
  if (booking.guestId !== req.user.id) throw forbidden('Access denied');
  if (!['pending', 'awaiting_payment'].includes(booking.status)) {
    throw badRequest('Only unpaid bookings can be cancelled');
  }

  booking.status = 'cancelled';
  await booking.save();
  res.json({ message: 'Booking cancelled', booking });
});

exports.confirmCarBooking = confirmCarBooking;

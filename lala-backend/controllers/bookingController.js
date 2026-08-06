const crypto = require('crypto');
const { Op } = require('sequelize');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const User = require('../models/User');
const sequelize = require('../config/database');
const paymentService = require('../services/paymentService');
const smsService = require('../services/smsService');
const logger = require('../utils/logger');
const {
  AppError,
  asyncHandler,
  badRequest,
  notFound,
  forbidden,
  conflict,
} = require('../middleware/errorHandler');

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Strict YYYY-MM-DD parse that rejects impossible dates (e.g. 2024-02-30). */
function parseDateOnly(value) {
  if (!value || typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

/** True if the caller threw a Postgres exclusion_violation (23P01). */
function isExclusionViolation(err) {
  return err?.original?.code === '23P01' || err?.parent?.code === '23P01';
}

/**
 * POST /api/bookings
 * Create booking (awaiting_payment) then trigger Lenco USSD push.
 *
 * Concurrency safety (double-booking):
 *  1. Application: listing row is locked FOR UPDATE inside a transaction, then
 *     an overlap check runs against non-cancelled bookings, then the booking is
 *     inserted — all in the same transaction, so two concurrent requests for
 *     the same listing serialize.
 *  2. Database: the `bookings_no_overlap` EXCLUDE constraint (migration +
 *     boot-time schema guard) rejects overlapping rows at the DB level even if
 *     the application check is bypassed or races.
 * The Lenco push happens AFTER commit so the row lock is never held across a
 * 30-second external network call.
 */
const createBooking = asyncHandler(async (req, res) => {
  const { listingId, checkIn, checkOut, provider, phone } = req.body;
  const guestId = req.user?.id;

  if (!listingId || !checkIn || !checkOut) {
    throw badRequest('listingId, checkIn and checkOut are required');
  }
  const checkInDate = parseDateOnly(checkIn);
  const checkOutDate = parseDateOnly(checkOut);
  if (!checkInDate || !checkOutDate || checkInDate >= checkOutDate) {
    throw badRequest('Invalid date range. checkOut must be a valid date after checkIn.');
  }
  const nights = Math.ceil((checkOutDate - checkInDate) / MS_PER_DAY);

  // Guest pays stay + 10% service fee (e.g. K90 + K9 = K99). Must match listing-detail UI.
  const serviceFeeRate = Number(process.env.LENCO_COMMISSION_RATE || 0.10);
  const reference = `lala-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  let booking;
  try {
    booking = await sequelize.transaction(async (tx) => {
      // Serialize concurrent bookings for this listing via row locking.
      const listing = await Listing.findByPk(listingId, {
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      if (!listing) throw notFound('Listing not found');

      // Belt-and-braces overlap check for a clean 409. The EXCLUDE constraint
      // is the authoritative guard; this gives a friendly message.
      const overlapping = await Booking.findOne({
        where: {
          listingId,
          status: { [Op.ne]: 'cancelled' },
          checkIn: { [Op.lt]: checkOutDate },
          checkOut: { [Op.gt]: checkInDate },
        },
        transaction: tx,
      });
      if (overlapping) {
        throw conflict('This property is already booked for the selected dates.');
      }

      const subtotal = Number(listing.price) * nights;
      const serviceFee = Math.round(subtotal * serviceFeeRate);
      const totalAmount = subtotal + serviceFee;

      return Booking.create({
        listingId,
        guestId,
        checkIn,
        checkOut,
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        totalAmount,
        provider,
        guestPhone: phone,
        transactionRef: reference,
      }, { transaction: tx });
    });
  } catch (err) {
    // Two requests can still race past the lock (e.g. different transactions
    // committing concurrently); the DB constraint is the backstop. Map it to
    // the same clean 409 the app-level check returns.
    if (isExclusionViolation(err)) {
      throw conflict('This property is already booked for the selected dates.');
    }
    throw err;
  }

  // Payment push AFTER commit — never hold the listing row lock across the call.
  let lencoData;
  try {
    lencoData = await paymentService.initiateMomoPush({
      amount: booking.totalAmount,
      reference,
      phone,
      operator: provider,
    });
  } catch (err) {
    // Money not yet collected. The booking is kept (awaiting_payment) so the
    // dates stay reserved and the guest can retry — do NOT roll it back.
    logger.error('payment.push.failed', {
      bookingId: booking.id,
      reference,
      amount: booking.totalAmount,
      provider,
      err: err.message,
    });
    throw new AppError(502, 'Payment push failed. Please try again.');
  }

  booking.lencoReference = lencoData.lencoReference;
  booking.paymentStatus = lencoData.status;
  await booking.save();

  logger.info('payment.push.initiated', {
    bookingId: booking.id,
    reference,
    amount: booking.totalAmount,
    provider,
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
 * GET /api/bookings/:id/status
 * Frontend polls this from the USSD-waiting screen.
 */
const getBookingPaymentStatus = asyncHandler(async (req, res) => {
  const booking = await Booking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');

  if (['successful', 'failed'].includes(booking.paymentStatus)) {
    logger.info('payment.poll.terminal', {
      bookingId: booking.id,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
    });
    return res.json({ paymentStatus: booking.paymentStatus, status: booking.status });
  }

  // No Lenco reference to poll (legacy record) — surface the stored state.
  if (!booking.transactionRef) {
    logger.warn('payment.poll.no-ref', { bookingId: booking.id });
    return res.json({ paymentStatus: booking.paymentStatus, status: booking.status });
  }

  const lencoData = await paymentService.verifyCollectionStatus(booking.transactionRef);
  const previousStatus = booking.paymentStatus;
  booking.paymentStatus = lencoData.status;

  logger.info('payment.poll.status', {
    bookingId: booking.id,
    transactionRef: booking.transactionRef,
    previousStatus,
    lencoStatus: lencoData.status,
    bookingStatus: booking.status,
  });

  if (lencoData.status === 'successful' && booking.status !== 'confirmed') {
    await confirmBooking(booking);
  } else {
    await booking.save();
  }

  return res.json({ paymentStatus: booking.paymentStatus, status: booking.status });
});

/**
 * Internal: confirm a booking, send SMS, and settle.
 * Called ONLY after Lenco confirms 'successful' (via poll or webhook).
 *
 * Concurrency guard: the status flip is an atomic compare-and-set
 * (UPDATE ... WHERE status != 'confirmed'). If a webhook and the status poll
 * race, only ONE caller wins the flip and proceeds to settle — preventing a
 * double payout of the lodge or commission transfer.
 */
async function confirmBooking(booking) {
  const [affected] = await Booking.update(
    { status: 'confirmed', paymentStatus: 'successful' },
    { where: { id: booking.id, status: { [Op.ne]: 'confirmed' } } }
  );

  if (affected === 0) {
    logger.warn('booking.confirm.skipped', {
      bookingId: booking.id,
      reason: 'already confirmed by another request',
    });
    return booking;
  }

  booking.status = 'confirmed';
  booking.paymentStatus = 'successful';
  logger.info('booking.confirmed', { bookingId: booking.id });

  // existing SMS — failure never blocks confirmation or settlement
  try { await smsService.sendBookingConfirmation(booking); }
  catch (e) { logger.warn('booking.sms.failed', { bookingId: booking.id, err: e.message }); }

  // Settle: 90% to lodge hostPhone + 10% to operator commission number. Crash-safe — won't throw.
  await require('../services/settlementService').settleBooking(booking);

  return booking;
}

/** Strip settlement/commission fields so guests never see the 10% split. */
function publicBookingFields(bookingJson, role) {
  if (role === 'admin') return bookingJson;
  const {
    commissionAmount,
    commissionStatus,
    commissionRef,
    lodgeStatus,
    lodgeRef,
    lodgePayoutAmount,
    ...safe
  } = bookingJson;
  // Hosts may see their own lodge payout status, not Lala commission
  if (role === 'host') {
    return { ...safe, lodgeStatus, lodgeRef, lodgePayoutAmount };
  }
  return safe;
}

/**
 * GET /api/bookings/:id
 * Returns booking details (guest can only access their own bookings).
 */
const getBookingDetails = asyncHandler(async (req, res) => {
  const booking = await Booking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');

  // Security: guest can only view their own booking
  if (req.user.role === 'guest' && booking.guestId !== req.user.id) {
    throw forbidden('Access denied');
  }

  const listing = await Listing.findByPk(booking.listingId);

  res.json(publicBookingFields({
    ...booking.toJSON(),
    listingName: listing ? listing.name : 'Unknown',
    listingCity: listing ? listing.city : '',
    listingDistrict: listing ? listing.district : ''
  }, req.user.role));
});

/**
 * GET /api/bookings/guest/all
 * Returns all bookings for the logged-in guest.
 */
const getGuestBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.findAll({
    where: { guestId: req.user.id },
    order: [['createdAt', 'DESC']]
  });

  // Enrich with listing names (hide commission from guests)
  const enriched = await Promise.all(bookings.map(async (b) => {
    const listing = await Listing.findByPk(b.listingId);
    return publicBookingFields({
      ...b.toJSON(),
      listingName: listing ? listing.name : 'Unknown',
      listingCity: listing ? listing.city : ''
    }, 'guest');
  }));

  res.json(enriched);
});

/**
 * GET /api/bookings/host/all
 * Returns all bookings for the logged-in host's listings.
 */
const getHostBookings = asyncHandler(async (req, res) => {
  const listings = await Listing.findAll({ where: { hostId: req.user.id }, attributes: ['id', 'name'] });
  const listingIds = listings.map(l => l.id);
  const listingMap = Object.fromEntries(listings.map(l => [l.id, l.name]));

  const bookings = await Booking.findAll({
    where: { listingId: listingIds },
    order: [['createdAt', 'DESC']]
  });

  // Fetch guest names
  const guestIds = [...new Set(bookings.map(b => b.guestId))];
  const guests = await User.findAll({ where: { id: guestIds }, attributes: ['id', 'name', 'phone'] });
  const guestMap = Object.fromEntries(guests.map(g => [g.id, { name: g.name, phone: g.phone }]));

  const enriched = bookings.map(b => publicBookingFields({
    ...b.toJSON(),
    listingName: listingMap[b.listingId] || 'Unknown',
    guest: guestMap[b.guestId] || { name: 'Guest', phone: '' }
  }, 'host'));

  res.json(enriched);
});

/**
 * POST /api/bookings/:id/cancel
 * Guest cancels their own booking (only if pending or awaiting_payment).
 */
const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');

  if (booking.guestId !== req.user.id) {
    throw forbidden('Access denied');
  }

  if (!['pending', 'awaiting_payment'].includes(booking.status)) {
    throw badRequest('Only pending bookings can be cancelled');
  }

  booking.status = 'cancelled';
  await booking.save();

  logger.info('booking.cancelled', { bookingId: booking.id, by: 'guest' });
  res.json({ message: 'Booking cancelled', booking });
});

/**
 * POST /api/bookings/:id/host-cancel
 * Host cancels a booking on their listing.
 */
const hostCancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');

  const listing = await Listing.findByPk(booking.listingId);
  if (!listing || (listing.hostId !== req.user.id && req.user.role !== 'admin')) {
    throw forbidden('Access denied');
  }

  booking.status = 'cancelled';
  await booking.save();

  logger.info('booking.cancelled', { bookingId: booking.id, by: 'host' });
  res.json({ message: 'Booking cancelled by host', booking });
});

/**
 * GET /api/bookings/admin/all
 * Admin views all bookings across the platform.
 */
const getAllBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.findAll({
    order: [['createdAt', 'DESC']],
    limit: 200
  });

  // Fetch all listing names and guest names
  const listingIds = [...new Set(bookings.map(b => b.listingId))];
  const guestIds = [...new Set(bookings.map(b => b.guestId))];

  const listings = await Listing.findAll({ where: { id: listingIds }, attributes: ['id', 'name'] });
  const guests = await User.findAll({ where: { id: guestIds }, attributes: ['id', 'name', 'phone'] });

  const listingMap = Object.fromEntries(listings.map(l => [l.id, l.name]));
  const guestMap = Object.fromEntries(guests.map(g => [g.id, { name: g.name, phone: g.phone }]));

  const enriched = bookings.map(b => ({
    ...b.toJSON(),
    listingName: listingMap[b.listingId] || 'Unknown',
    guest: guestMap[b.guestId] || { name: 'Guest', phone: '' }
  }));

  res.json(enriched);
});

/**
 * @deprecated - kept for backward compatibility; use createBooking which auto-initiates payment
 */
async function initiatePayment(req, res) {
  res.status(410).json({ error: 'Deprecated. Use POST /api/bookings with provider and phone fields.' });
}

module.exports = {
  createBooking,
  getBookingPaymentStatus,
  confirmBooking,
  getBookingDetails,
  getGuestBookings,
  getHostBookings,
  cancelBooking,
  hostCancelBooking,
  getAllBookings,
  initiatePayment,
};

const crypto = require('crypto');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const User = require('../models/User');
const paymentService = require('../services/paymentService');
const smsService = require('../services/smsService');

/**
 * POST /api/bookings
 * Create booking (awaiting_payment) then trigger Lenco USSD push.
 */
async function createBooking(req, res) {
  try {
    const { listingId, checkIn, checkOut, provider, phone, totalAmount } = req.body;
    const guestId = req.user?.id;

    const reference = `lala-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    const booking = await Booking.create({
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
    });

    const lencoData = await paymentService.initiateMomoPush({
      amount: totalAmount,
      reference,
      phone,
      operator: provider,
    });

    booking.lencoReference = lencoData.lencoReference;
    booking.paymentStatus = lencoData.status;
    await booking.save();

    return res.status(201).json({
      bookingId: booking.id,
      reference,
      paymentStatus: booking.paymentStatus,
      message: 'Approve the payment on your phone.',
    });
  } catch (err) {
    console.error('[createBooking] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/bookings/:id/status
 * Frontend polls this from the USSD-waiting screen.
 */
async function getBookingPaymentStatus(req, res) {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (['successful', 'failed'].includes(booking.paymentStatus)) {
      return res.json({ paymentStatus: booking.paymentStatus, status: booking.status });
    }

    const lencoData = await paymentService.verifyCollectionStatus(booking.transactionRef);
    booking.paymentStatus = lencoData.status;

    if (lencoData.status === 'successful' && booking.status !== 'confirmed') {
      await confirmBooking(booking);
    } else {
      await booking.save();
    }

    return res.json({ paymentStatus: booking.paymentStatus, status: booking.status });
  } catch (err) {
    console.error('[getBookingPaymentStatus] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Internal: confirm a booking and send SMS.
 * Called ONLY after Lenco confirms 'successful' (via poll or webhook).
 */
async function confirmBooking(booking) {
  booking.status = 'confirmed';
  booking.paymentStatus = 'successful';
  await booking.save();

  try {
    await smsService.sendBookingConfirmation(booking);
  } catch (smsErr) {
    console.error('[confirmBooking] SMS failed (booking still confirmed):', smsErr.message);
  }
  return booking;
}

/**
 * GET /api/bookings/:id
 * Returns booking details (guest can only access their own bookings).
 */
exports.getBookingDetails = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Security: guest can only view their own booking
    if (req.user.role === 'guest' && booking.guestId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const listing = await Listing.findByPk(booking.listingId);

    res.json({
      ...booking.toJSON(),
      listingName: listing ? listing.name : 'Unknown',
      listingCity: listing ? listing.city : '',
      listingDistrict: listing ? listing.district : ''
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/bookings/guest/all
 * Returns all bookings for the logged-in guest.
 */
exports.getGuestBookings = async (req, res) => {
  try {
    const bookings = await Booking.findAll({
      where: { guestId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    // Enrich with listing names
    const enriched = await Promise.all(bookings.map(async (b) => {
      const listing = await Listing.findByPk(b.listingId);
      return {
        ...b.toJSON(),
        listingName: listing ? listing.name : 'Unknown',
        listingCity: listing ? listing.city : ''
      };
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/bookings/host/all
 * Returns all bookings for the logged-in host's listings.
 */
exports.getHostBookings = async (req, res) => {
  try {
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

    const enriched = bookings.map(b => ({
      ...b.toJSON(),
      listingName: listingMap[b.listingId] || 'Unknown',
      guest: guestMap[b.guestId] || { name: 'Guest', phone: '' }
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/bookings/:id/cancel
 * Guest cancels their own booking (only if pending or awaiting_payment).
 */
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.guestId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!['pending', 'awaiting_payment'].includes(booking.status)) {
      return res.status(400).json({ error: 'Only pending bookings can be cancelled' });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({ message: 'Booking cancelled', booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/bookings/:id/host-cancel
 * Host cancels a booking on their listing.
 */
exports.hostCancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const listing = await Listing.findByPk(booking.listingId);
    if (!listing || (listing.hostId !== req.user.id && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({ message: 'Booking cancelled by host', booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/bookings/admin/all
 * Admin views all bookings across the platform.
 */
exports.getAllBookings = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

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

const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const User = require('../models/User');
const paymentService = require('../services/paymentService');
const smsService = require('../services/smsService');

/**
 * POST /api/bookings
 * Creates a booking and immediately initiates mobile money payment.
 * Body: { listingId, checkIn, checkOut, provider, phone }
 */
exports.createBooking = async (req, res) => {
  const { listingId, checkIn, checkOut, provider, phone } = req.body;

  if (!listingId || !checkIn || !checkOut || !provider || !phone) {
    return res.status(400).json({ error: 'listingId, checkIn, checkOut, provider, and phone are required' });
  }

  try {
    const listing = await Listing.findByPk(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    // Calculate total amount
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
    const totalAmount = nights * listing.price;

    // Create booking record
    const booking = await Booking.create({
      listingId,
      guestId: req.user.id,
      checkIn,
      checkOut,
      totalAmount,
      provider,
      guestPhone: phone,
      status: 'awaiting_payment'
    });

    // Initiate mobile money push
    const paymentResult = await paymentService.initiateMomoPush(booking, provider, phone);

    if (paymentResult.success) {
      booking.transactionRef = paymentResult.transactionRef;
      booking.status = 'awaiting_payment';
      await booking.save();

      res.status(201).json({
        message: paymentResult.message,
        booking: {
          id: booking.id,
          listingId: booking.listingId,
          listingName: listing.name,
          listingCity: listing.city,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          nights,
          totalAmount: booking.totalAmount,
          provider: booking.provider,
          transactionRef: booking.transactionRef,
          status: booking.status
        }
      });
    } else {
      // Payment initiation failed — mark booking as failed
      booking.status = 'payment_failed';
      await booking.save();
      res.status(500).json({ error: 'Failed to initiate payment. Please try again.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/bookings/:id/confirm
 * Webhook / polling endpoint — marks booking as confirmed and sends SMS.
 * In production this is called by the payment aggregator webhook.
 */
exports.confirmBooking = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const listing = await Listing.findByPk(booking.listingId);

    booking.status = 'confirmed';
    await booking.save();

    // Send confirmation SMS to guest
    if (booking.guestPhone) {
      const msg = `Lala: Booking confirmed! ${listing ? listing.name : 'Your stay'} from ${booking.checkIn} to ${booking.checkOut}. Ref: ${booking.transactionRef || booking.id.split('-')[0].toUpperCase()}. Enjoy your stay!`;
      await smsService.sendSMS(booking.guestPhone, msg);
    }

    res.json({
      message: 'Booking confirmed',
      booking: {
        id: booking.id,
        listingName: listing ? listing.name : 'Unknown',
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalAmount: booking.totalAmount,
        provider: booking.provider,
        transactionRef: booking.transactionRef,
        status: booking.status
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

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

    const enriched = bookings.map(b => ({
      ...b.toJSON(),
      listingName: listingMap[b.listingId] || 'Unknown'
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @deprecated - kept for backward compatibility; use createBooking which auto-initiates payment
 */
exports.initiatePayment = async (req, res) => {
  res.status(410).json({ error: 'Deprecated. Use POST /api/bookings with provider and phone fields.' });
};

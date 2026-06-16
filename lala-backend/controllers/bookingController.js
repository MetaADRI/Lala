const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const paymentService = require('../services/paymentService');

exports.createBooking = async (req, res) => {
  const { listingId, checkIn, checkOut } = req.body;

  try {
    const listing = await Listing.findByPk(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    // Calculate total amount
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    const totalAmount = (nights || 1) * listing.price;

    const booking = await Booking.create({
      listingId,
      guestId: req.user.id,
      checkIn,
      checkOut,
      totalAmount,
      status: 'pending'
    });

    res.status(201).json({ message: 'Booking request sent', booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getBookingDetails = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.initiatePayment = async (req, res) => {
  const { bookingId, provider, phone } = req.body;

  try {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Use Payment Service
    const paymentResult = await paymentService.initiateMomoPush(booking, provider, phone);

    if (paymentResult.success) {
      booking.status = 'awaiting_payment';
      await booking.save();
      
      res.json({
        message: paymentResult.message,
        transactionRef: paymentResult.transactionRef,
        status: 'initiated',
        bookingId
      });
    } else {
      res.status(500).json({ error: 'Failed to initiate payment' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getHostBookings = async (req, res) => {
  try {
    const listings = await Listing.findAll({ where: { hostId: req.user.id }, attributes: ['id'] });
    const listingIds = listings.map(l => l.id);

    const bookings = await Booking.findAll({ where: { listingId: listingIds } });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

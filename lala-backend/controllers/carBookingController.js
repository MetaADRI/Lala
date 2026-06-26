const CarBooking = require('../models/CarBooking');
const Car = require('../models/Car');

exports.createCarBooking = async (req, res) => {
  const { carId, tripType, pickupLocation, dropoffLocation, pickupDate, pickupTime, passengerCount, guestPhone, notes } = req.body;
  if (!carId || !tripType || !pickupLocation || !dropoffLocation || !pickupDate || !pickupTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const car = await Car.findByPk(carId);
    if (!car) return res.status(404).json({ error: 'Car not found' });

    let totalAmount;
    if (tripType === 'airport') {
      totalAmount = car.airportPrice || 0;
    } else {
      totalAmount = car.pricePerKm || 0;
    }

    const booking = await CarBooking.create({
      carId, guestId: req.user.id, tripType, pickupLocation, dropoffLocation,
      pickupDate, pickupTime, flightNumber: req.body.flightNumber || null,
      passengerCount: passengerCount || 1, totalAmount, guestPhone: guestPhone || null, notes
    });

    res.status(201).json({ message: 'Transfer booked', booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getGuestCarBookings = async (req, res) => {
  try {
    const bookings = await CarBooking.findAll({
      where: { guestId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    const carIds = [...new Set(bookings.map(b => b.carId))];
    const cars = await Car.findAll({ where: { id: carIds }, attributes: ['id', 'model', 'driverName', 'driverPhone'] });
    const carMap = Object.fromEntries(cars.map(c => [c.id, c]));
    const enriched = bookings.map(b => ({ ...b.toJSON(), car: carMap[b.carId] || null }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDriverCarBookings = async (req, res) => {
  try {
    const cars = await Car.findAll({ where: { hostId: req.user.id }, attributes: ['id'] });
    const carIds = cars.map(c => c.id);
    const bookings = await CarBooking.findAll({
      where: { carId: carIds },
      order: [['createdAt', 'DESC']]
    });
    const allCars = await Car.findAll({ where: { id: carIds }, attributes: ['id', 'model', 'driverName'] });
    const carMap = Object.fromEntries(allCars.map(c => [c.id, c]));
    const enriched = bookings.map(b => ({ ...b.toJSON(), car: carMap[b.carId] || null }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateCarBookingStatus = async (req, res) => {
  try {
    const booking = await CarBooking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const car = await Car.findByPk(booking.carId);
    if (car.hostId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    booking.status = req.body.status;
    await booking.save();
    res.json({ message: 'Booking updated', booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.cancelCarBooking = async (req, res) => {
  try {
    const booking = await CarBooking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.guestId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ error: 'Booking cannot be cancelled' });
    }
    booking.status = 'cancelled';
    await booking.save();
    res.json({ message: 'Booking cancelled', booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

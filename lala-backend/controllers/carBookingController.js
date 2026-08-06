const CarBooking = require('../models/CarBooking');
const Car = require('../models/Car');
const { asyncHandler, badRequest, notFound, forbidden } = require('../middleware/errorHandler');

exports.createCarBooking = asyncHandler(async (req, res) => {
  const { carId, tripType, pickupLocation, dropoffLocation, pickupDate, pickupTime, passengerCount, guestPhone, notes } = req.body;
  if (!carId || !tripType || !pickupLocation || !dropoffLocation || !pickupDate || !pickupTime) {
    throw badRequest('Missing required fields');
  }

  const car = await Car.findByPk(carId);
  if (!car) throw notFound('Car not found');

  const totalAmount = tripType === 'airport' ? (car.airportPrice || 0) : (car.pricePerKm || 0);

  const booking = await CarBooking.create({
    carId, guestId: req.user.id, tripType, pickupLocation, dropoffLocation,
    pickupDate, pickupTime, flightNumber: req.body.flightNumber || null,
    passengerCount: passengerCount || 1, totalAmount, guestPhone: guestPhone || null, notes
  });

  res.status(201).json({ message: 'Transfer booked', booking });
});

exports.getGuestCarBookings = asyncHandler(async (req, res) => {
  const bookings = await CarBooking.findAll({
    where: { guestId: req.user.id },
    order: [['createdAt', 'DESC']]
  });
  const carIds = [...new Set(bookings.map(b => b.carId))];
  const cars = await Car.findAll({ where: { id: carIds }, attributes: ['id', 'model', 'driverName', 'driverPhone'] });
  const carMap = Object.fromEntries(cars.map(c => [c.id, c]));
  res.json(bookings.map(b => ({ ...b.toJSON(), car: carMap[b.carId] || null })));
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
  res.json(bookings.map(b => ({ ...b.toJSON(), car: carMap[b.carId] || null })));
});

exports.updateCarBookingStatus = asyncHandler(async (req, res) => {
  const booking = await CarBooking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');

  const car = await Car.findByPk(booking.carId);
  if (car.hostId !== req.user.id && req.user.role !== 'admin') throw forbidden('Access denied');

  booking.status = req.body.status;
  await booking.save();
  res.json({ message: 'Booking updated', booking });
});

exports.cancelCarBooking = asyncHandler(async (req, res) => {
  const booking = await CarBooking.findByPk(req.params.id);
  if (!booking) throw notFound('Booking not found');
  if (booking.guestId !== req.user.id) throw forbidden('Access denied');
  if (!['pending', 'confirmed'].includes(booking.status)) throw badRequest('Booking cannot be cancelled');

  booking.status = 'cancelled';
  await booking.save();
  res.json({ message: 'Booking cancelled', booking });
});

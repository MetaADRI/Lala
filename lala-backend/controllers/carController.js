const Car = require('../models/Car');
const { Op } = require('sequelize');
const { asyncHandler, notFound, forbidden } = require('../middleware/errorHandler');

const CAR_FIELDS = [
  'driverName', 'driverPhone', 'model', 'plateNumber', 'seats', 'pricePerKm',
  'airportPrice', 'city', 'description', 'photos', 'isActive',
];

exports.getAllCars = asyncHandler(async (req, res) => {
  const { city, sort } = req.query;
  const where = { isActive: true };

  if (city) where.city = { [Op.iLike]: `%${city}%` };

  const order = sort === 'price_asc' ? [['pricePerKm', 'ASC']] : [['createdAt', 'DESC']];

  const cars = await Car.findAll({ where, order });
  res.json(cars);
});

exports.getCarById = asyncHandler(async (req, res) => {
  const car = await Car.findByPk(req.params.id);
  if (!car) throw notFound('Car not found');
  res.json(car);
});

exports.getMyCars = asyncHandler(async (req, res) => {
  const cars = await Car.findAll({
    where: { hostId: req.user.id },
    order: [['createdAt', 'DESC']]
  });
  res.json(cars);
});

exports.createCar = asyncHandler(async (req, res) => {
  // Whitelist body fields — never trust the client with id/hostId.
  const data = {};
  for (const field of CAR_FIELDS) {
    if (req.body[field] !== undefined) data[field] = req.body[field];
  }

  const car = await Car.create({ ...data, hostId: req.user.id });
  res.status(201).json({ message: 'Car registered', car });
});

exports.updateCar = asyncHandler(async (req, res) => {
  const car = await Car.findByPk(req.params.id);
  if (!car) throw notFound('Car not found');
  if (car.hostId !== req.user.id && req.user.role !== 'admin') throw forbidden('Access denied');

  CAR_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) car[f] = req.body[f];
  });

  await car.save();
  res.json({ message: 'Car updated', car });
});

exports.deleteCar = asyncHandler(async (req, res) => {
  const car = await Car.findByPk(req.params.id);
  if (!car) throw notFound('Car not found');
  if (car.hostId !== req.user.id && req.user.role !== 'admin') throw forbidden('Access denied');

  await car.destroy();
  res.json({ message: 'Car removed' });
});

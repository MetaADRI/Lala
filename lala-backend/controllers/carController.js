const Car = require('../models/Car');

exports.getAllCars = async (req, res) => {
  const { city, sort } = req.query;
  const where = { isActive: true };

  if (city) where.city = { [require('sequelize').Op.iLike]: `%${city}%` };

  const order = sort === 'price_asc' ? [['pricePerKm', 'ASC']] : [['createdAt', 'DESC']];

  try {
    const cars = await Car.findAll({ where, order });
    res.json(cars);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCarById = async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    res.json(car);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyCars = async (req, res) => {
  try {
    const cars = await Car.findAll({
      where: { hostId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(cars);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createCar = async (req, res) => {
  try {
    const car = await Car.create({
      ...req.body,
      hostId: req.user.id
    });
    res.status(201).json({ message: 'Car registered', car });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateCar = async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    if (car.hostId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const allowed = ['driverName', 'driverPhone', 'model', 'plateNumber', 'seats', 'pricePerKm', 'airportPrice', 'city', 'description', 'photos', 'isActive'];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) car[f] = req.body[f];
    });

    await car.save();
    res.json({ message: 'Car updated', car });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteCar = async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    if (car.hostId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    await car.destroy();
    res.json({ message: 'Car removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

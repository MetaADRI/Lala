const express = require('express');
const router = express.Router();
const carController = require('../controllers/carController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.get('/', carController.getAllCars);
router.get('/mine', authMiddleware, carController.getMyCars);
router.get('/:id', carController.getCarById);
router.post('/', authMiddleware, carController.createCar);
router.put('/:id', authMiddleware, carController.updateCar);
router.delete('/:id', authMiddleware, carController.deleteCar);

module.exports = router;

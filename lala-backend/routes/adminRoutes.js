const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.use(authMiddleware, roleMiddleware(['admin']));

router.get('/users', adminController.listUsers);
router.patch('/users/:id/status', adminController.setUserStatus);

module.exports = router;

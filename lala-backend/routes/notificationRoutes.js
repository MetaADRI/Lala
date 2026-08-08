const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, notificationController.getMine);
router.get('/unread-count', authMiddleware, notificationController.getUnreadCount);
router.patch('/:id/read', authMiddleware, notificationController.markRead);
router.post('/read-all', authMiddleware, notificationController.markAllRead);

module.exports = router;

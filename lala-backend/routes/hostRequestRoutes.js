const express = require('express');
const router = express.Router();
const hostRequestController = require('../controllers/hostRequestController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.post('/', authMiddleware, hostRequestController.requestHost);
router.get('/mine', authMiddleware, hostRequestController.getMyHostRequest);
router.get('/', authMiddleware, roleMiddleware(['admin']), hostRequestController.getAllHostRequests);
router.post('/:id/approve', authMiddleware, roleMiddleware(['admin']), hostRequestController.approveHostRequest);
router.post('/:id/reject', authMiddleware, roleMiddleware(['admin']), hostRequestController.rejectHostRequest);

module.exports = router;

const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listingController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.get('/', listingController.getAllListings);
router.get('/pending', authMiddleware, roleMiddleware(['admin']), listingController.getPendingListings);
router.get('/:id', listingController.getListingById);
router.post('/', authMiddleware, roleMiddleware(['host', 'admin']), listingController.createListing);
router.patch('/:id/approve', authMiddleware, roleMiddleware(['admin']), listingController.approveListing);
router.delete('/:id/reject', authMiddleware, roleMiddleware(['admin']), listingController.rejectListing);

module.exports = router;

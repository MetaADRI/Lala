const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listingController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.get('/', listingController.getAllListings);
router.get('/pending', authMiddleware, roleMiddleware(['admin']), listingController.getPendingListings);
router.get('/mine', authMiddleware, roleMiddleware(['host', 'admin']), listingController.getMyListings);
router.get('/:id', listingController.getListingById);
router.post('/', authMiddleware, roleMiddleware(['host', 'admin']), listingController.createListing);
router.patch('/:id/approve', authMiddleware, roleMiddleware(['admin']), listingController.approveListing);
router.delete('/:id/reject', authMiddleware, roleMiddleware(['admin']), listingController.rejectListing);
router.put('/:id', authMiddleware, roleMiddleware(['host', 'admin']), listingController.updateListing);

module.exports = router;

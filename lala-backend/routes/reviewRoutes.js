const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authMiddleware } = require('../middleware/auth');

// Protected routes (require auth token)
router.post('/', authMiddleware, reviewController.createReview);
router.get('/can-review/:listingId', authMiddleware, reviewController.checkCanReview);
router.get('/host/rating', authMiddleware, reviewController.getHostRating);
router.post('/host/respond', authMiddleware, reviewController.hostRespond);

// Public route to fetch reviews (must be last — catches by listingId)
router.get('/:listingId', reviewController.getListingReviews);

module.exports = router;

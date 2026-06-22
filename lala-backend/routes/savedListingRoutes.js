const express = require('express');
const router = express.Router();
const savedListingController = require('../controllers/savedListingController');
const { authMiddleware } = require('../middleware/auth');

router.post('/', authMiddleware, savedListingController.toggleSaved);
router.get('/', authMiddleware, savedListingController.getSavedListings);

module.exports = router;

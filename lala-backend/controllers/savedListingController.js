const SavedListing = require('../models/SavedListing');
const Listing = require('../models/Listing');
const { asyncHandler, badRequest } = require('../middleware/errorHandler');

exports.toggleSaved = asyncHandler(async (req, res) => {
  const { listingId } = req.body;
  const userId = req.user.id;

  if (!listingId) throw badRequest('listingId is required');

  const existing = await SavedListing.findOne({ where: { userId, listingId } });

  if (existing) {
    await existing.destroy();
    return res.json({ saved: false, message: 'Listing removed from saved' });
  }

  await SavedListing.create({ userId, listingId });
  res.json({ saved: true, message: 'Listing saved' });
});

exports.getSavedListings = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const saved = await SavedListing.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    include: [{ model: Listing, attributes: ['id', 'name', 'city', 'district', 'price', 'photos', 'type'] }]
  });

  res.json(saved.map(s => s.Listing || s));
});

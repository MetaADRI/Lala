const SavedListing = require('../models/SavedListing');
const Listing = require('../models/Listing');

exports.toggleSaved = async (req, res) => {
  const { listingId } = req.body;
  const userId = req.user.id;

  if (!listingId) return res.status(400).json({ error: 'listingId is required' });

  try {
    const existing = await SavedListing.findOne({ where: { userId, listingId } });

    if (existing) {
      await existing.destroy();
      return res.json({ saved: false, message: 'Listing removed from saved' });
    }

    await SavedListing.create({ userId, listingId });
    res.json({ saved: true, message: 'Listing saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSavedListings = async (req, res) => {
  const userId = req.user.id;

  try {
    const saved = await SavedListing.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      include: [{ model: Listing, attributes: ['id', 'name', 'city', 'district', 'price', 'photos', 'type'] }]
    });

    res.json(saved.map(s => s.Listing || s));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

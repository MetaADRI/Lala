const Listing = require('../models/Listing');
const { Op } = require('sequelize');

exports.getAllListings = async (req, res) => {
  const { city, type, minPrice, maxPrice } = req.query;
  const where = { isApproved: true };

  if (city) where.city = city;
  if (type) where.type = type;
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price[Op.gte] = parseFloat(minPrice);
    if (maxPrice) where.price[Op.lte] = parseFloat(maxPrice);
  }

  try {
    const listings = await Listing.findAll({ where });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getListingById = async (req, res) => {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    res.json(listing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createListing = async (req, res) => {
  try {
    const listing = await Listing.create({
      ...req.body,
      hostId: req.user.id,
      isApproved: false // Requires admin approval
    });
    res.status(201).json({ message: 'Listing created and pending approval', listing });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.approveListing = async (req, res) => {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    listing.isApproved = true;
    await listing.save();
    res.json({ message: 'Listing approved', listing });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

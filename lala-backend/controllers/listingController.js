const Listing = require('../models/Listing');
const User = require('../models/User');
const Review = require('../models/Review');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

exports.getAllListings = async (req, res) => {
  const { city, type, minPrice, maxPrice, sort, limit, offset } = req.query;
  const where = { isApproved: true };

  if (city) where.city = { [Op.iLike]: `%${city}%` };
  if (type) where.type = type;
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price[Op.gte] = parseFloat(minPrice);
    if (maxPrice) where.price[Op.lte] = parseFloat(maxPrice);
  }

  const sortOptions = {
    'price_asc': [['price', 'ASC']],
    'price_desc': [['price', 'DESC']],
    'newest': [['createdAt', 'DESC']]
  };
  const order = sortOptions[sort] || [['createdAt', 'DESC']];
  const queryLimit = limit ? parseInt(limit, 10) : 50;
  const queryOffset = offset ? parseInt(offset, 10) : 0;

  try {
    const listings = await Listing.findAll({ where, order, limit: queryLimit, offset: queryOffset });
    
    // Fetch average ratings and counts in a group query
    const reviews = await Review.findAll({
      attributes: [
        'listingId',
        [sequelize.fn('AVG', sequelize.col('rating')), 'ratingAverage'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'reviewCount']
      ],
      group: ['listingId']
    });

    const reviewsMap = reviews.reduce((map, r) => {
      map[r.listingId] = {
        ratingAverage: parseFloat(parseFloat(r.getDataValue('ratingAverage') || 0).toFixed(1)),
        reviewCount: parseInt(r.getDataValue('reviewCount') || 0, 10)
      };
      return map;
    }, {});

    const results = listings.map(listing => {
      const rev = reviewsMap[listing.id] || { ratingAverage: 0, reviewCount: 0 };
      return {
        ...listing.toJSON(),
        ratingAverage: rev.ratingAverage,
        reviewCount: rev.reviewCount
      };
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getListingById = async (req, res) => {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    
    const reviews = await Review.findAll({ where: { listingId: req.params.id } });
    const reviewCount = reviews.length;
    const ratingAverage = reviewCount > 0 
      ? parseFloat((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1))
      : 0;

    res.json({
      ...listing.toJSON(),
      ratingAverage,
      reviewCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyListings = async (req, res) => {
  try {
    const listings = await Listing.findAll({
      where: { hostId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPendingListings = async (req, res) => {
  try {
    const listings = await Listing.findAll({ where: { isApproved: false }, order: [['createdAt', 'DESC']] });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createListing = async (req, res) => {
  try {
    // Fetch host's phone number so WhatsApp links use the real number
    const host = await User.findByPk(req.user.id);

    const listing = await Listing.create({
      ...req.body,
      hostId: req.user.id,
      hostPhone: host ? host.phone : null,
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

exports.rejectListing = async (req, res) => {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    await listing.destroy();
    res.json({ message: 'Listing rejected and removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateListing = async (req, res) => {
  try {
    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    // Only the host who owns it or an admin can update
    if (req.user.role !== 'admin' && listing.hostId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const allowedFields = ['name', 'type', 'city', 'district', 'price', 'description', 'amenities', 'cancellationPolicy', 'photos'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    // If admin updates, they can also change approval status
    if (req.user.role === 'admin' && req.body.isApproved !== undefined) {
      listing.isApproved = req.body.isApproved;
    }

    await listing.save();
    res.json({ message: 'Listing updated', listing });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const Listing = require('../models/Listing');
const User = require('../models/User');
const Review = require('../models/Review');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const { asyncHandler, badRequest, notFound, forbidden } = require('../middleware/errorHandler');

/** Fields a client may set when creating/updating a listing. Prevents mass-assignment. */
const ALLOWED_LISTING_FIELDS = [
  'name', 'type', 'city', 'district', 'price', 'description', 'amenities', 'photos', 'cancellationPolicy',
];

const intOrDefault = (raw, def) => {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? def : n;
};

exports.getAllListings = asyncHandler(async (req, res) => {
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
  const queryLimit = limit ? intOrDefault(limit, 50) : 50;
  const queryOffset = offset ? intOrDefault(offset, 0) : 0;

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
});

exports.getListingById = asyncHandler(async (req, res) => {
  const listing = await Listing.findByPk(req.params.id);
  if (!listing) throw notFound('Listing not found');

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
});

exports.getMyListings = asyncHandler(async (req, res) => {
  const listings = await Listing.findAll({
    where: { hostId: req.user.id },
    order: [['createdAt', 'DESC']]
  });
  res.json(listings);
});

exports.getPendingListings = asyncHandler(async (req, res) => {
  const listings = await Listing.findAll({ where: { isApproved: false }, order: [['createdAt', 'DESC']] });
  res.json(listings);
});

exports.createListing = asyncHandler(async (req, res) => {
  const { name, type, city, district, price } = req.body;
  if (!name || !type || !city || !district || price == null) {
    throw badRequest('name, type, city, district and price are required');
  }
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw badRequest('price must be a non-negative number');
  }

  // Whitelist body fields — never trust the client with id/hostId/isApproved.
  const data = {};
  for (const field of ALLOWED_LISTING_FIELDS) {
    if (req.body[field] !== undefined) data[field] = req.body[field];
  }
  data.price = numericPrice;

  // Fetch host's phone number so WhatsApp links use the real number
  const host = await User.findByPk(req.user.id);

  const listing = await Listing.create({
    ...data,
    hostId: req.user.id,
    hostPhone: host ? host.phone : null,
    isApproved: false // Requires admin approval
  });
  res.status(201).json({ message: 'Listing created and pending approval', listing });
});

exports.approveListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findByPk(req.params.id);
  if (!listing) throw notFound('Listing not found');

  listing.isApproved = true;
  await listing.save();
  res.json({ message: 'Listing approved', listing });
});

exports.rejectListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findByPk(req.params.id);
  if (!listing) throw notFound('Listing not found');

  await listing.destroy();
  res.json({ message: 'Listing rejected and removed' });
});

exports.updateListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findByPk(req.params.id);
  if (!listing) throw notFound('Listing not found');

  // Only the host who owns it or an admin can update
  if (req.user.role !== 'admin' && listing.hostId !== req.user.id) {
    throw forbidden('Access denied');
  }

  ALLOWED_LISTING_FIELDS.forEach(field => {
    if (req.body[field] !== undefined) {
      listing[field] = req.body[field];
    }
  });
  if (req.body.price !== undefined && !Number.isFinite(Number(req.body.price))) {
    throw badRequest('price must be a number');
  }

  // If admin updates, they can also change approval status
  if (req.user.role === 'admin' && req.body.isApproved !== undefined) {
    listing.isApproved = req.body.isApproved;
  }

  await listing.save();
  res.json({ message: 'Listing updated', listing });
});

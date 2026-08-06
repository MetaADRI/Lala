const Review = require('../models/Review');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Listing = require('../models/Listing');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { asyncHandler, badRequest, notFound, forbidden } = require('../middleware/errorHandler');

function subRatings(body) {
  return {
    cleanliness: body.cleanliness ? parseInt(body.cleanliness, 10) : null,
    comfort: body.comfort ? parseInt(body.comfort, 10) : null,
    location: body.location ? parseInt(body.location, 10) : null,
    value: body.value ? parseInt(body.value, 10) : null,
  };
}

function serializeReview(r, guest) {
  return {
    id: r.id,
    listingId: r.listingId,
    rating: r.rating,
    cleanliness: r.cleanliness,
    comfort: r.comfort,
    location: r.location,
    value: r.value,
    comment: r.comment,
    hostResponse: r.hostResponse,
    hostRespondedAt: r.hostRespondedAt,
    createdAt: r.createdAt,
    guest: guest ? { name: guest.name, phone: guest.phone } : { name: 'Anonymous', phone: '' }
  };
}

exports.createReview = asyncHandler(async (req, res) => {
  const { listingId, rating, comment } = req.body;
  const guestId = req.user.id;

  if (!listingId || !rating) throw badRequest('listingId and rating are required');

  const numericRating = parseInt(rating, 10);
  if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
    throw badRequest('Rating must be an integer between 1 and 5');
  }

  const confirmedBooking = await Booking.findOne({
    where: { listingId, guestId, status: 'confirmed' }
  });
  if (!confirmedBooking) {
    throw forbidden('You can only review properties where you have a confirmed stay.');
  }

  const existingReview = await Review.findOne({ where: { listingId, guestId } });
  if (existingReview) throw badRequest('You have already reviewed this listing.');

  const review = await Review.create({
    listingId,
    guestId,
    rating: numericRating,
    ...subRatings(req.body),
    comment
  });

  const guest = await User.findByPk(guestId);
  res.status(201).json({ message: 'Review submitted successfully', review: serializeReview(review, guest) });
});

exports.getListingReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.findAll({
    where: { listingId: req.params.listingId },
    order: [['createdAt', 'DESC']]
  });

  const guestIds = [...new Set(reviews.map(r => r.guestId))];
  const guests = await User.findAll({
    where: { id: guestIds },
    attributes: ['id', 'name', 'phone']
  });

  const guestMap = guests.reduce((map, guest) => { map[guest.id] = guest; return map; }, {});
  res.json(reviews.map(r => serializeReview(r, guestMap[r.guestId])));
});

exports.checkCanReview = asyncHandler(async (req, res) => {
  const { listingId } = req.params;
  const guestId = req.user.id;

  const confirmedBooking = await Booking.findOne({ where: { listingId, guestId, status: 'confirmed' } });
  const existingReview = await Review.findOne({ where: { listingId, guestId } });

  res.json({
    canReview: !!confirmedBooking && !existingReview,
    alreadyReviewed: !!existingReview
  });
});

exports.hostRespond = asyncHandler(async (req, res) => {
  const { reviewId, response } = req.body;
  const hostId = req.user.id;

  if (!reviewId || !response) throw badRequest('reviewId and response are required');

  const review = await Review.findByPk(reviewId);
  if (!review) throw notFound('Review not found');

  const listing = await Listing.findByPk(review.listingId);
  if (!listing || listing.hostId !== hostId) {
    throw forbidden('You can only respond to reviews for your own listings.');
  }

  review.hostResponse = response;
  review.hostRespondedAt = new Date();
  await review.save();

  res.json({ message: 'Response submitted', hostResponse: response, hostRespondedAt: review.hostRespondedAt });
});

exports.getHostRating = asyncHandler(async (req, res) => {
  const hostId = req.user.id;

  const hostListings = await Listing.findAll({ where: { hostId }, attributes: ['id'] });
  if (hostListings.length === 0) {
    return res.json({ ratingAverage: 0, reviewCount: 0 });
  }

  const listingIds = hostListings.map(l => l.id);
  const result = await Review.findOne({
    attributes: [
      [sequelize.fn('AVG', sequelize.col('rating')), 'ratingAverage'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'reviewCount']
    ],
    where: { listingId: { [Op.in]: listingIds } }
  });

  res.json({
    ratingAverage: parseFloat(parseFloat(result.getDataValue('ratingAverage') || 0).toFixed(1)),
    reviewCount: parseInt(result.getDataValue('reviewCount') || 0, 10)
  });
});

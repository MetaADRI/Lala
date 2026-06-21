const Review = require('../models/Review');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Listing = require('../models/Listing');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

exports.createReview = async (req, res) => {
  const { listingId, rating, comment } = req.body;
  const guestId = req.user.id;

  if (!listingId || !rating) {
    return res.status(400).json({ error: 'listingId and rating are required' });
  }

  const numericRating = parseInt(rating, 10);
  if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
  }

  try {
    // Check if user has a confirmed stay for this listing
    const confirmedBooking = await Booking.findOne({
      where: {
        listingId,
        guestId,
        status: 'confirmed'
      }
    });

    if (!confirmedBooking) {
      return res.status(403).json({ error: 'You can only review properties where you have a confirmed stay.' });
    }

    // Check if user already reviewed this listing
    const existingReview = await Review.findOne({
      where: {
        listingId,
        guestId
      }
    });

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this listing.' });
    }

    const review = await Review.create({
      listingId,
      guestId,
      rating: numericRating,
      comment
    });

    // Load guest info to return with the review
    const guest = await User.findByPk(guestId);

    res.status(201).json({
      message: 'Review submitted successfully',
      review: {
        id: review.id,
        listingId: review.listingId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        guest: guest ? { name: guest.name, phone: guest.phone } : { name: 'Anonymous', phone: '' }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getListingReviews = async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { listingId: req.params.listingId },
      order: [['createdAt', 'DESC']]
    });

    const guestIds = [...new Set(reviews.map(r => r.guestId))];
    const guests = await User.findAll({
      where: { id: guestIds },
      attributes: ['id', 'name', 'phone']
    });

    const guestMap = guests.reduce((map, guest) => {
      map[guest.id] = guest;
      return map;
    }, {});

    const results = reviews.map(r => {
      const guest = guestMap[r.guestId];
      return {
        id: r.id,
        listingId: r.listingId,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        guest: guest ? { name: guest.name, phone: guest.phone } : { name: 'Anonymous', phone: '' }
      };
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.checkCanReview = async (req, res) => {
  const { listingId } = req.params;
  const guestId = req.user.id;

  try {
    const confirmedBooking = await Booking.findOne({
      where: {
        listingId,
        guestId,
        status: 'confirmed'
      }
    });

    const existingReview = await Review.findOne({
      where: {
        listingId,
        guestId
      }
    });

    res.json({
      canReview: !!confirmedBooking && !existingReview,
      alreadyReviewed: !!existingReview
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getHostRating = async (req, res) => {
  try {
    const hostId = req.user.id;

    const hostListings = await Listing.findAll({
      where: { hostId },
      attributes: ['id']
    });

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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const HostRequest = require('../models/HostRequest');
const User = require('../models/User');
const { asyncHandler, badRequest, notFound, forbidden, conflict } = require('../middleware/errorHandler');

/**
 * Logged-in guest submits an application to become a host.
 * Never promotes directly — the request must be approved by an admin.
 */
exports.requestHost = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !name.trim()) throw badRequest('Name is required');

  const user = await User.findByPk(req.user.id);
  if (!user) throw notFound('User not found');
  if (user.role === 'host') throw conflict('You are already a host');
  if (user.role === 'admin') throw forbidden('Admin accounts do not need host approval');

  const existing = await HostRequest.findOne({
    where: { userId: user.id, status: 'pending' }
  });
  if (existing) throw conflict('You already have a pending host application');

  const request = await HostRequest.create({
    userId: user.id,
    name: name.trim(),
    phone: phone ? String(phone).trim() : (user.phone || null)
  });

  res.status(201).json({ message: 'Host application submitted for review', request });
});

/** The current user's most recent host application (if any). */
exports.getMyHostRequest = asyncHandler(async (req, res) => {
  const request = await HostRequest.findOne({
    where: { userId: req.user.id },
    order: [['createdAt', 'DESC']]
  });
  res.json({ request: request ? request.toJSON() : null });
});

/** Admin: all host applications, pending first. */
exports.getAllHostRequests = asyncHandler(async (req, res) => {
  const requests = await HostRequest.findAll({
    include: [{ model: User, attributes: ['id', 'email', 'role'], as: 'user' }],
    order: [['createdAt', 'DESC']]
  });

  // Pending first, then by recency.
  const sorted = requests.sort((a, b) => {
    const rank = (r) => (r.status === 'pending' ? 0 : r.status === 'approved' ? 1 : 2);
    return rank(a) - rank(b);
  });

  res.json(sorted);
});

const review = async (req, res, decision) => {
  const request = await HostRequest.findByPk(req.params.id);
  if (!request) throw notFound('Host application not found');
  if (request.status !== 'pending') throw conflict('This application has already been reviewed');

  if (decision === 'approve') {
    const user = await User.findByPk(request.userId);
    if (!user) throw notFound('Applicant account no longer exists');
    user.role = 'host';
    if (!user.name) user.name = request.name;
    if (!user.phone && request.phone) user.phone = request.phone;
    await user.save();
    request.status = 'approved';
  } else {
    request.status = 'rejected';
  }
  request.reviewedAt = new Date();
  await request.save();

  res.json({
    message: decision === 'approve' ? 'Host application approved' : 'Host application rejected',
    request
  });
};

exports.approveHostRequest = asyncHandler(async (req, res) => {
  await review(req, res, 'approve');
});

exports.rejectHostRequest = asyncHandler(async (req, res) => {
  await review(req, res, 'reject');
});

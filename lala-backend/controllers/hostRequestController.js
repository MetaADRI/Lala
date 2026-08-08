const HostRequest = require('../models/HostRequest');
const User = require('../models/User');
const { notify } = require('../services/notificationService');
const { asyncHandler, badRequest, notFound, forbidden, conflict } = require('../middleware/errorHandler');

/**
 * Logged-in guest submits an application to become a host.
 * Never promotes directly — the request must be approved by an admin.
 */
exports.requestHost = asyncHandler(async (req, res) => {
  const { name, phone, propertyNumber, nationalIdNumber, idDocumentPhoto, proofOfOwnershipDocument } = req.body;
  if (!name || !name.trim()) throw badRequest('Name is required');
  if (!nationalIdNumber || !String(nationalIdNumber).trim()) throw badRequest('National ID number is required');
  if (!propertyNumber || !String(propertyNumber).trim()) throw badRequest('Property number is required');
  if (!idDocumentPhoto) throw badRequest('A photo of your national ID is required');
  if (!proofOfOwnershipDocument) throw badRequest('Proof of ownership (title deed or council letter) is required');

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
    phone: phone ? String(phone).trim() : (user.phone || null),
    propertyNumber: String(propertyNumber).trim(),
    nationalIdNumber: String(nationalIdNumber).trim(),
    idDocumentPhoto,
    proofOfOwnershipDocument
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

  const admin = await User.findByPk(req.user.id);
  if (!admin || admin.role !== 'admin') throw forbidden('Only admins can review host applications');

  if (decision === 'approve') {
    const user = await User.findByPk(request.userId);
    if (!user) throw notFound('Applicant account no longer exists');
    user.role = 'host';
    if (!user.name) user.name = request.name;
    if (!user.phone && request.phone) user.phone = request.phone;
    await user.save();
    request.status = 'approved';
    notify(user.id, 'host_approved', 'You are now a host!', 'Your application to become a host was approved. Sign in again to start listing your property.', 'host-dashboard.html');
  } else {
    const reason = req.body && req.body.rejectionReason ? String(req.body.rejectionReason).trim() : '';
    request.status = 'rejected';
    request.rejectionReason = reason || null;
    notify(request.userId, 'host_rejected', 'Host application not approved', reason ? `Your application was not approved: ${reason}` : 'Your application to become a host was not approved. You may apply again.', 'become-host.html');
  }
  request.reviewedAt = new Date();
  request.reviewedBy = req.user.id;
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

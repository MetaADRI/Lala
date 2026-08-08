const Notification = require('../models/Notification');
const { asyncHandler, notFound } = require('../middleware/errorHandler');

/** Current user's notifications, newest first, most recent 50. */
exports.getMine = asyncHandler(async (req, res) => {
  const notifications = await Notification.findAll({
    where: { userId: req.user.id },
    order: [['createdAt', 'DESC']],
    limit: 50
  });
  res.json(notifications);
});

/** Count of unread notifications for the current user (for the badge). */
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.count({
    where: { userId: req.user.id, readAt: null }
  });
  res.json({ count });
});

/** Mark one notification as read. */
exports.markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    where: { id: req.params.id, userId: req.user.id }
  });
  if (!notification) throw notFound('Notification not found');
  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  res.json({ message: 'Notification marked as read', notification });
});

/** Mark all of the current user's notifications as read. */
exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.update(
    { readAt: new Date() },
    { where: { userId: req.user.id, readAt: null } }
  );
  res.json({ message: 'All notifications marked as read' });
});

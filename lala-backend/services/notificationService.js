const Notification = require('../models/Notification');

// Fire-and-forget: create an in-app notification for a recipient. Never throws —
// notification failures must not break the underlying operation (approval, etc).
exports.notify = async (userId, type, title, message, link = null) => {
  try {
    await Notification.create({ userId, type, title, message, link });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('notification.create.failed', err.message);
  }
};

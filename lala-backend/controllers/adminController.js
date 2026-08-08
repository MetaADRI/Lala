const User = require('../models/User');
const { asyncHandler, badRequest, notFound, forbidden } = require('../middleware/errorHandler');

/** Admin: list all users (id, email, name, role, status). */
exports.listUsers = asyncHandler(async (req, res) => {
  const users = await User.findAll({
    attributes: ['id', 'email', 'name', 'phone', 'role', 'status', 'createdAt'],
    order: [['createdAt', 'DESC']]
  });
  res.json(users);
});

/** Admin: set a user's account status (active | suspended | paused). */
exports.setUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended', 'paused'].includes(status)) {
    throw badRequest('Invalid status. Use active, suspended or paused.');
  }

  const user = await User.findByPk(req.params.id);
  if (!user) throw notFound('User not found');

  if (user.role === 'admin' && user.id !== req.user.id) {
    throw forbidden('You cannot change the status of another admin account.');
  }
  // Guard against locking yourself out of the admin account.
  if (user.id === req.user.id && status !== 'active') {
    throw forbidden('You cannot suspend or pause your own account.');
  }

  user.status = status;
  await user.save();

  res.json({ message: `User status updated to ${status}`, user: { id: user.id, email: user.email, role: user.role, status: user.status } });
});

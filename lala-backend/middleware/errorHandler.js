// middleware/errorHandler.js
// Shared error helpers + Express error middleware.
// Normalizes EVERY error to the JSON shape the frontend already expects:
//   { error: "<message>" }
// Status codes are standardized: 400 validation, 401 auth, 403 forbidden,
// 404 not found, 409 conflict/duplicate, 500 unexpected (sanitized).
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.expose = true;
  }
}

const badRequest = (msg) => new AppError(400, msg);
const unauthorized = (msg) => new AppError(401, msg);
const forbidden = (msg) => new AppError(403, msg);
const notFound = (msg) => new AppError(404, msg);
const conflict = (msg) => new AppError(409, msg);

/** Wrap an async route handler so thrown/rejected errors reach the central middleware. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** 404 for any unmatched route — returns the same JSON shape as everything else. */
const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

/**
 * Map known errors (AppError, Sequelize validation/unique, Postgres constraint
 * codes, multer) to a client-safe { status, message }. Everything else becomes
 * a sanitized 500 — internal details go to the server log only.
 */
function resolveError(err) {
  if (err instanceof AppError) return { status: err.status, message: err.message };

  if (err instanceof Sequelize.ValidationError) {
    return { status: 400, message: err.errors?.[0]?.message || 'Validation error' };
  }
  if (err instanceof Sequelize.UniqueConstraintError) {
    return { status: 409, message: 'A record with the same unique value already exists' };
  }

  // PostgreSQL error codes (err.original is the pg driver error in Sequelize 6)
  const dbCode = err?.original?.code || err?.parent?.code;
  if (dbCode === '23P01') {
    // exclusion_violation — the bookings_no_overlap constraint fired
    return { status: 409, message: 'This property is already booked for the selected dates' };
  }
  if (dbCode === '23505') {
    return { status: 409, message: 'A record with the same unique value already exists' };
  }
  if (dbCode === '23503') {
    return { status: 400, message: 'Referenced record does not exist' };
  }

  if (err?.name === 'MulterError') {
    return { status: 400, message: err.message };
  }

  return { status: 500, message: 'Internal server error' };
}

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const { status, message } = resolveError(err);
  const ctx = { method: req.method, path: req.originalUrl, status };

  if (status >= 500) {
    logger.error('http.500', { ...ctx, err: err.message, stack: err.stack });
  } else {
    logger.warn('http.error', ctx);
  }

  res.status(status).json({ error: message });
};

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  asyncHandler,
  notFoundHandler,
  errorHandler,
  resolveError,
};

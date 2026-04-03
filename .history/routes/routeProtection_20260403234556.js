/**
 * Route Protection Helper
 * Provides middleware functions to protect routes with session-based authentication
 */

const { sessionAuth, requireAdmin } = require('../middleware/sessionAuth');

/**
 * Protect write operations (POST, PUT, DELETE) with admin authentication
 * Read operations (GET) remain public
 */
function protectWriteOperations(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return sessionAuth(req, res, () => {
      requireAdmin(req, res, next);
    });
  }
  // GET requests are public
  next();
}

/**
 * Require admin for all operations on specific route
 */
function requireAdminAll(req, res, next) {
  sessionAuth(req, res, () => {
    requireAdmin(req, res, next);
  });
}

module.exports = {
  protectWriteOperations,
  requireAdminAll
};

/**
 * Authentication Middleware (Legacy - Deprecated)
 * This file is kept for backward compatibility but basic auth has been removed
 * Use session-based authentication from middleware/sessionAuth.js instead
 */

/**
 * Setup legacy authentication (DEPRECATED - no longer used)
 * All routes now use session-based authentication
 */
function setupAuthentication(app) {
  // This function is deprecated
  // Clean URL routes are now handled in app.js
  console.log('⚠️  Legacy authentication setup called (deprecated)');
}

module.exports = { setupAuthentication };

/**
 * Modern Authentication Middleware
 * Replaces basic auth with token-based authentication
 */

const { validateSession } = require('../services/userService');

/**
 * Session-based authentication middleware
 */
async function sessionAuth(req, res, next) {
  try {
    // Get token from Authorization header or cookie
    const authHeader = req.headers.authorization;
    const token = req.cookies?.sessionToken || 
                  (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }
    
    // Validate session
    const result = await validateSession(token);
    
    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
        message: 'Please log in again'
      });
    }
    
    // Attach user info to request
    req.user = result.user;
    req.sessionToken = token;
    
    next();
  } catch (err) {
    console.error('Session auth error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      message: 'Admin privileges required'
    });
  }
  next();
}

/**
 * Optional authentication - doesn't fail if not authenticated
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = req.cookies?.sessionToken || 
                  (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);
    
    if (token) {
      const result = await validateSession(token);
      if (result.valid) {
        req.user = result.user;
        req.sessionToken = token;
      }
    }
    
    next();
  } catch (err) {
    // Continue without authentication
    next();
  }
}

module.exports = {
  sessionAuth,
  requireAdmin,
  optionalAuth
};

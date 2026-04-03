/**
 * Modern Authentication Middleware
 * Replaces basic auth with token-based authentication using secure httpOnly cookies
 */

const { validateSession } = require('../services/userService');

/**
 * Session-based authentication middleware
 * Validates token from httpOnly cookie or Authorization header
 */
async function sessionAuth(req, res, next) {
  try {
    // Get token from httpOnly cookie (preferred) or Authorization header
    const token = req.cookies?.sessionToken || 
                  (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
                    ? req.headers.authorization.slice(7) 
                    : null);
    
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
      // Clear invalid cookie
      res.clearCookie('sessionToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      
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
 * Ensures the authenticated user has admin privileges
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      message: 'Admin privileges required for this action'
    });
  }
  next();
}

/**
 * Require specific role(s)
 * Flexible role checking - accepts single role or array of roles
 * @param {string|string[]} roles - Required role(s)
 */
function requireRole(roles) {
  return (req, res, next) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
}

/**
 * Optional authentication - doesn't fail if not authenticated
 * Useful for endpoints that behave differently for logged-in users
 */
async function optionalAuth(req, res, next) {
  try {
    const token = req.cookies?.sessionToken || 
                  (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
                    ? req.headers.authorization.slice(7) 
                    : null);
    
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

/**
 * Granular Permission-Based Access Control
 * Extends basic role-based auth with fine-grained permissions
 */

const { sessionAuth } = require('./sessionAuth');

/**
 * Permission definitions and their required roles
 * This allows granular control over specific actions
 */
const PERMISSIONS = {
  // Stream management permissions
  'streams:view': ['admin', 'user'],
  'streams:create': ['admin'],
  'streams:start': ['admin'],
  'streams:stop': ['admin'],
  'streams:delete': ['admin'],
  'streams:rename': ['admin'],
  'streams:upload': ['admin'],
  
  // User management permissions
  'users:view': ['admin'],
  'users:create': ['admin'],
  'users:update': ['admin'],
  'users:delete': ['admin'],
  
  // System permissions
  'system:diagnostics': ['admin'],
  'system:settings': ['admin'],
  
  // Content permissions (for future expansion)
  'content:manage': ['admin'],
  'content:publish': ['admin']
};

/**
 * Check if user has required permission
 * @param {string} permission - Permission string (e.g., 'streams:create')
 * @param {object} user - User object with role property
 * @returns {boolean}
 */
function hasPermission(permission, user) {
  if (!user || !user.role) {
    return false;
  }
  
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) {
    console.warn(`Warning: Unknown permission '${permission}'`);
    return false;
  }
  
  return allowedRoles.includes(user.role);
}

/**
 * Middleware factory to check specific permission
 * @param {string} permission - Required permission
 * @returns {Function} Express middleware
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      // First ensure user is authenticated
      await sessionAuth(req, res, () => {
        // Then check permission
        if (!hasPermission(permission, req.user)) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            message: `You don't have permission to ${permission.replace(':', ' ')}`,
            requiredPermission: permission,
            yourRole: req.user?.role || 'none'
          });
        }
        next();
      });
    } catch (err) {
      console.error('Permission check error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Authorization failed'
      });
    }
  };
}

/**
 * Middleware to check multiple permissions (OR logic - needs any one)
 * @param {string[]} permissions - Array of permission strings
 * @returns {Function} Express middleware
 */
function requireAnyPermission(permissions) {
  return async (req, res, next) => {
    try {
      await sessionAuth(req, res, () => {
        const hasAnyPermission = permissions.some(p => hasPermission(p, req.user));
        
        if (!hasAnyPermission) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            message: 'You need at least one of these permissions: ' + permissions.join(', '),
            requiredPermissions: permissions,
            yourRole: req.user?.role || 'none'
          });
        }
        next();
      });
    } catch (err) {
      console.error('Permission check error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Authorization failed'
      });
    }
  };
}

/**
 * Middleware to check all permissions (AND logic - needs all)
 * @param {string[]} permissions - Array of permission strings
 * @returns {Function} Express middleware
 */
function requireAllPermissions(permissions) {
  return async (req, res, next) => {
    try {
      await sessionAuth(req, res, () => {
        const hasAllPermissions = permissions.every(p => hasPermission(p, req.user));
        
        if (!hasAllPermissions) {
          const missing = permissions.filter(p => !hasPermission(p, req.user));
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            message: 'Missing required permissions: ' + missing.join(', '),
            missingPermissions: missing,
            yourRole: req.user?.role || 'none'
          });
        }
        next();
      });
    } catch (err) {
      console.error('Permission check error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Authorization failed'
      });
    }
  };
}

/**
 * Get all available permissions for a user role
 * @param {string} role - User role
 * @returns {string[]} Array of permission strings
 */
function getPermissionsForRole(role) {
  return Object.keys(PERMISSIONS).filter(permission => 
    PERMISSIONS[permission].includes(role)
  );
}

/**
 * Add custom permission dynamically
 * @param {string} permission - Permission string
 * @param {string[]} roles - Array of roles that have this permission
 */
function addPermission(permission, roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error('Roles must be a non-empty array');
  }
  PERMISSIONS[permission] = roles;
}

/**
 * Remove permission
 * @param {string} permission - Permission to remove
 */
function removePermission(permission) {
  delete PERMISSIONS[permission];
}

/**
 * Get all defined permissions
 * @returns {object} All permissions
 */
function getAllPermissions() {
  return { ...PERMISSIONS };
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  hasPermission,
  getPermissionsForRole,
  addPermission,
  removePermission,
  getAllPermissions
};

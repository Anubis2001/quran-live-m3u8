/**
 * User Management Service
 * Handles user authentication, registration, and management with MySQL
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getPool } = require('./database');
const validator = require('validator');

const SALT_ROUNDS = 12;
const SESSION_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_MINUTES = 60;

/**
 * Generate UUID v4 (backward compatible)
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Hash password securely
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify password against hash
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Create initial admin user if none exists
 */
async function createInitialAdminUser() {
  const pool = getPool();
  
  try {
    // Check if any admin exists
    const [admins] = await pool.execute(
      'SELECT id FROM users WHERE role = ? LIMIT 1',
      ['admin']
    );
    
    if (admins.length === 0) {
      // Create default admin
      const adminId = uuidv4();
      const hashedPassword = await hashPassword('@!JKF3eWd12'); // Default password from old system
      
      await pool.execute(
        'INSERT INTO users (id, username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, 'admin', 'admin@localhost', hashedPassword, 'admin', true]
      );
      
      console.log('✓ Default admin user created (username: admin, password: @!JKF3eWd12)');
      console.log('⚠️  IMPORTANT: Change the default password immediately after first login!');
    }
  } catch (err) {
    console.error('Error creating initial admin:', err.message);
  }
}

/**
 * Register a new user
 */
async function registerUser(userData, requestingUserId = null) {
  const pool = getPool();
  
  try {
    const { username, email, password, role } = userData;
    
    // Validate input
    if (!username || !password) {
      throw new Error('Username and password are required');
    }
    
    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      throw new Error('Username must be 3-30 characters long and contain only letters, numbers, and underscores');
    }
    
    // Validate email if provided
    if (email && !validator.isEmail(email)) {
      throw new Error('Invalid email address');
    }
    
    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    
    // Check if username already exists
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (existing.length > 0) {
      throw new Error('Username already exists');
    }
    
    // Determine role - only admins can create other admins
    const userRole = role === 'admin' && requestingUserId ? 
      (await checkUserRole(requestingUserId) === 'admin' ? 'admin' : 'user') : 
      (role || 'user');
    
    // Hash password and create user
    const userId = uuidv4();
    const hashedPassword = await hashPassword(password);
    
    await pool.execute(
      'INSERT INTO users (id, username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, username, email || null, hashedPassword, userRole, true]
    );
    
    logActivity(userId, 'user_registered', `New user registered: ${username}`);
    
    return {
      success: true,
      message: 'User registered successfully',
      userId,
      username,
      role: userRole
    };
  } catch (err) {
    console.error('Registration error:', err.message);
    throw err;
  }
}

/**
 * Check user role
 */
async function checkUserRole(userId) {
  const pool = getPool();
  
  try {
    const [users] = await pool.execute(
      'SELECT role FROM users WHERE id = ? AND is_active = TRUE',
      [userId]
    );
    
    return users.length > 0 ? users[0].role : null;
  } catch (err) {
    console.error('Check user role error:', err.message);
    return null;
  }
}

/**
 * Authenticate user with username and password
 */
async function authenticateUser(username, password, ipAddress = null, userAgent = null) {
  const pool = getPool();
  
  try {
    // Get user by username
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE username = ? AND is_active = TRUE',
      [username]
    );
    
    if (users.length === 0) {
      logActivity(null, 'login_failed', `Failed login attempt for username: ${username}`, ipAddress, userAgent);
      return { success: false, error: 'Invalid username or password' };
    }
    
    const user = users[0];
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      logActivity(user.id, 'login_failed', 'Invalid password', ipAddress, userAgent);
      return { success: false, error: 'Invalid username or password' };
    }
    
    // Update last login timestamp
    await pool.execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );
    
    // Invalidate all existing sessions for this user (security enhancement)
    await pool.execute(
      'UPDATE sessions SET is_valid = FALSE WHERE user_id = ?',
      [user.id]
    );
    
    // Create new session token
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + (SESSION_EXPIRY_HOURS * 60 * 60 * 1000));
    
    await pool.execute(
      'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [uuidv4(), user.id, sessionToken, expiresAt]
    );
    
    logActivity(user.id, 'login_success', 'User logged in successfully', ipAddress, userAgent);
    
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      token: sessionToken,
      expiresIn: SESSION_EXPIRY_HOURS * 60 * 60 * 1000 // milliseconds
    };
  } catch (err) {
    console.error('Authentication error:', err.message);
    return { success: false, error: 'Authentication failed' };
  }
}

/**
 * Validate session token
 */
async function validateSession(token) {
  const pool = getPool();
  
  try {
    const [sessions] = await pool.execute(
      `SELECT s.*, u.id as user_id, u.username, u.email, u.role 
       FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.token = ? AND s.is_valid = TRUE AND s.expires_at > NOW() AND u.is_active = TRUE`,
      [token]
    );
    
    if (sessions.length === 0) {
      return { valid: false };
    }
    
    const session = sessions[0];
    
    return {
      valid: true,
      user: {
        id: session.user_id,
        username: session.username,
        email: session.email,
        role: session.role
      }
    };
  } catch (err) {
    console.error('Session validation error:', err.message);
    return { valid: false };
  }
}

/**
 * Invalidate session (logout)
 */
async function invalidateSession(token) {
  const pool = getPool();
  
  try {
    await pool.execute(
      'UPDATE sessions SET is_valid = FALSE WHERE token = ?',
      [token]
    );
    return true;
  } catch (err) {
    console.error('Session invalidation error:', err.message);
    return false;
  }
}

/**
 * Get all users (admin only)
 */
async function getAllUsers(requestingUserId) {
  const pool = getPool();
  
  try {
    // Verify requester is admin
    const [requester] = await pool.execute(
      'SELECT role FROM users WHERE id = ?',
      [requestingUserId]
    );
    
    if (requester.length === 0 || requester[0].role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }
    
    const [users] = await pool.execute(
      'SELECT id, username, email, role, is_active, created_at, updated_at, last_login FROM users ORDER BY created_at DESC'
    );
    
    return users;
  } catch (err) {
    console.error('Get users error:', err.message);
    throw err;
  }
}

/**
 * Create new user (admin only)
 */
async function createUser(userData, requestingUserId) {
  const pool = getPool();
  
  try {
    // Verify requester is admin
    const [requester] = await pool.execute(
      'SELECT role FROM users WHERE id = ?',
      [requestingUserId]
    );
    
    if (requester.length === 0 || requester[0].role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }
    
    const { username, email, password, role } = userData;
    
    // Validate input
    if (!username || !password) {
      throw new Error('Username and password are required');
    }
    
    // Check if username already exists
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (existing.length > 0) {
      throw new Error('Username already exists');
    }
    
    // Hash password and create user
    const userId = uuidv4();
    const hashedPassword = await hashPassword(password);
    
    await pool.execute(
      'INSERT INTO users (id, username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, username, email || null, hashedPassword, role || 'user', true]
    );
    
    logActivity(requestingUserId, 'user_created', `Created user: ${username}`);
    
    return {
      success: true,
      message: 'User created successfully',
      userId
    };
  } catch (err) {
    console.error('Create user error:', err.message);
    throw err;
  }
}

/**
 * Update user (admin or self)
 */
async function updateUser(userId, updates, requestingUserId) {
  const pool = getPool();
  
  try {
    // Check permissions
    const [requester] = await pool.execute(
      'SELECT role FROM users WHERE id = ?',
      [requestingUserId]
    );
    
    const isAdmin = requester.length > 0 && requester[0].role === 'admin';
    const isSelf = userId === requestingUserId;
    
    if (!isAdmin && !isSelf) {
      throw new Error('Unauthorized');
    }
    
    const fields = [];
    const values = [];
    
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    
    if (updates.role !== undefined && isAdmin) {
      fields.push('role = ?');
      values.push(updates.role);
    }
    
    if (updates.is_active !== undefined && isAdmin) {
      fields.push('is_active = ?');
      values.push(updates.is_active);
    }
    
    if (updates.password) {
      const hashedPassword = await hashPassword(updates.password);
      fields.push('password_hash = ?');
      values.push(hashedPassword);
    }
    
    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    values.push(userId);
    
    await pool.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    logActivity(requestingUserId, 'user_updated', `Updated user: ${userId}`);
    
    return { success: true, message: 'User updated successfully' };
  } catch (err) {
    console.error('Update user error:', err.message);
    throw err;
  }
}

/**
 * Delete user (admin only)
 */
async function deleteUser(userId, requestingUserId) {
  const pool = getPool();
  
  try {
    // Verify requester is admin
    const [requester] = await pool.execute(
      'SELECT role FROM users WHERE id = ?',
      [requestingUserId]
    );
    
    if (requester.length === 0 || requester[0].role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }
    
    // Prevent deleting yourself
    if (userId === requestingUserId) {
      throw new Error('Cannot delete your own account');
    }
    
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    
    logActivity(requestingUserId, 'user_deleted', `Deleted user: ${userId}`);
    
    return { success: true, message: 'User deleted successfully' };
  } catch (err) {
    console.error('Delete user error:', err.message);
    throw err;
  }
}

/**
 * Log user activity
 */
async function logActivity(userId, action, details = null, ipAddress = null, userAgent = null) {
  const pool = getPool();
  
  try {
    await pool.execute(
      'INSERT INTO activity_log (user_id, action, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [userId, action, details, ipAddress, userAgent]
    );
  } catch (err) {
    console.error('Activity logging error:', err.message);
  }
}

/**
 * Request password reset
 */
async function requestPasswordReset(email) {
  const pool = getPool();
  
  try {
    const [users] = await pool.execute(
      'SELECT id, username FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );
    
    if (users.length === 0) {
      // Don't reveal if email exists (security best practice)
      return { success: true, message: 'If an account exists with that email, a reset link has been sent' };
    }
    
    const user = users[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + (PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000));
    
    // Store reset token
    await pool.execute(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, resetToken, resetExpiry]
    );
    
    logActivity(user.id, 'password_reset_requested', 'Password reset requested', null, null);
    
    // In production, send email with reset link
    // For now, return the token (in real app, don't expose this)
    return {
      success: true,
      message: 'If an account exists with that email, a reset link has been sent',
      resetToken // Remove this in production when email sending is implemented
    };
  } catch (err) {
    console.error('Password reset request error:', err.message);
    return { success: false, error: 'Failed to process password reset request' };
  }
}

/**
 * Reset password with token
 */
async function resetPassword(token, newPassword) {
  const pool = getPool();
  
  try {
    // Validate new password
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    
    // Find valid reset token
    const [resets] = await pool.execute(
      `SELECT pr.user_id, u.username 
       FROM password_resets pr 
       JOIN users u ON pr.user_id = u.id 
       WHERE pr.token = ? AND pr.is_used = FALSE AND pr.expires_at > NOW() 
       ORDER BY pr.created_at DESC LIMIT 1`,
      [token]
    );
    
    if (resets.length === 0) {
      throw new Error('Invalid or expired reset token');
    }
    
    const reset = resets[0];
    const hashedPassword = await hashPassword(newPassword);
    
    // Update password
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hashedPassword, reset.user_id]
    );
    
    // Mark token as used
    await pool.execute(
      'UPDATE password_resets SET is_used = TRUE WHERE token = ?',
      [token]
    );
    
    // Invalidate all sessions for this user
    await pool.execute(
      'UPDATE sessions SET is_valid = FALSE WHERE user_id = ?',
      [reset.user_id]
    );
    
    logActivity(reset.user_id, 'password_reset_completed', 'Password reset completed', null, null);
    
    return { success: true, message: 'Password has been reset successfully' };
  } catch (err) {
    console.error('Password reset error:', err.message);
    throw err;
  }
}

/**
 * Change password (for authenticated user)
 */
async function changePassword(userId, currentPassword, newPassword) {
  const pool = getPool();
  
  try {
    // Validate new password
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }
    
    // Get user
    const [users] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ? AND is_active = TRUE',
      [userId]
    );
    
    if (users.length === 0) {
      throw new Error('User not found');
    }
    
    // Verify current password
    const isValid = await verifyPassword(currentPassword, users[0].password_hash);
    
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }
    
    // Hash and update password
    const hashedPassword = await hashPassword(newPassword);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hashedPassword, userId]
    );
    
    // Invalidate all sessions
    await pool.execute(
      'UPDATE sessions SET is_valid = FALSE WHERE user_id = ?',
      [userId]
    );
    
    logActivity(userId, 'password_changed', 'Password changed successfully', null, null);
    
    return { success: true, message: 'Password changed successfully. Please log in again.' };
  } catch (err) {
    console.error('Change password error:', err.message);
    throw err;
  }
}

module.exports = {
  hashPassword,
  createInitialAdminUser,
  registerUser,
  checkUserRole,
  authenticateUser,
  validateSession,
  invalidateSession,
  requestPasswordReset,
  resetPassword,
  changePassword,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  logActivity
};

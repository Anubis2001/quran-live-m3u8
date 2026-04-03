/**
 * User Management Service
 * Handles user authentication, registration, and management with MySQL
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('./database');

const SALT_ROUNDS = 12;
const SESSION_EXPIRY_HOURS = 24;

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
    
    // Create session token
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

module.exports = {
  hashPassword,
  createInitialAdminUser,
  authenticateUser,
  validateSession,
  invalidateSession,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  logActivity
};

/**
 * Authentication API Routes
 */

const express = require('express');
const router = express.Router();
const { 
  authenticateUser, 
  registerUser,
  invalidateSession,
  requestPasswordReset,
  resetPassword,
  changePassword,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser
} = require('../services/userService');
const { sessionAuth, requireAdmin } = require('../middleware/sessionAuth');

/**
 * POST /api/auth/register - User registration
 */
router.post('/register', async (req, res) => {
  try {
    const result = await registerUser(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(err.message.includes('already exists') ? 409 : 400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/auth/login - User login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    const result = await authenticateUser(username, password, ipAddress, userAgent);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/**
 * POST /api/auth/logout - User logout
 */
router.post('/logout', sessionAuth, async (req, res) => {
  try {
    await invalidateSession(req.sessionToken);
    
    // Clear httpOnly cookie
    res.clearCookie('sessionToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

/**
 * GET /api/auth/me - Get current user info
 */
router.get('/me', sessionAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

/**
 * POST /api/auth/forgot-password - Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }
    
    const result = await requestPasswordReset(email);
    res.json(result);
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request'
    });
  }
});

/**
 * POST /api/auth/reset-password - Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required'
      });
    }
    
    const result = await resetPassword(token, newPassword);
    res.json(result);
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/auth/change-password - Change password (authenticated users)
 */
router.post('/change-password', sessionAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }
    
    const result = await changePassword(req.user.id, currentPassword, newPassword);
    
    // Clear cookie since sessions are invalidated
    res.clearCookie('sessionToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json(result);
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/users - List all users (admin only)
 */
router.get('/users', sessionAuth, requireAdmin, async (req, res) => {
  try {
    const users = await getAllUsers(req.user.id);
    res.json({
      success: true,
      users
    });
  } catch (err) {
    console.error('Get users error:', err.message);
    res.status(err.message.includes('Unauthorized') ? 403 : 500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/users - Create new user (admin only)
 */
router.post('/users', sessionAuth, requireAdmin, async (req, res) => {
  try {
    const result = await createUser(req.body, req.user.id);
    res.status(201).json(result);
  } catch (err) {
    console.error('Create user error:', err.message);
    res.status(err.message.includes('already exists') ? 409 : 400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PUT /api/users/:id - Update user (admin or self)
 */
router.put('/users/:id', sessionAuth, async (req, res) => {
  try {
    const result = await updateUser(req.params.id, req.body, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(err.message.includes('Unauthorized') ? 403 : 400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/users/:id - Delete user (admin only)
 */
router.delete('/users/:id', sessionAuth, requireAdmin, async (req, res) => {
  try {
    const result = await deleteUser(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(err.message.includes('Unauthorized') ? 403 : 400).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;

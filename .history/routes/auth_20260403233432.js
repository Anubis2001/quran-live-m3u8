/**
 * Authentication API Routes
 */

const express = require('express');
const router = express.Router();
const { 
  authenticateUser, 
  invalidateSession,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser
} = require('../services/userService');
const { sessionAuth, requireAdmin } = require('../middleware/sessionAuth');

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

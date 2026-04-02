const express = require("express");
const basicAuth = require("express-basic-auth");

/**
 * Setup authentication middleware for admin routes
 * Implements role-based access control:
 * - Dashboard visible to all (no auth required for viewing)
 * - Admin actions (start/stop/delete/upload) require authentication
 */
function setupAuthentication(app) {
  // Define users with roles
  const users = {
    admin: "@!JKF3eWd12",      // Admin role - full access
    user: "user123"             // User role - view only
  };
  
  const authMiddleware = basicAuth({
    users: users,
    challenge: true,
    realm: 'Admin Access Required'
  });
  
  // Custom middleware to check admin role
  const requireAdmin = (req, res, next) => {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in with admin credentials' 
      });
    }
    
    // Check if user has admin role
    if (req.auth.user !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Admin privileges required for this action' 
      });
    }
    
    next();
  };
  
  // Dashboard accessible to all (no auth for GET /)
  app.get("/", (req, res) => {
    res.sendFile(require("path").join(__dirname, "..", "public", "dashboard.html"));
  });
  
  // API routes - differentiate between read and write operations
  // Read operations (GET) - no auth required
  app.get("/api/*", (req, res, next) => {
    next();
  });
  
  // Write operations (POST, PUT, DELETE) - require admin auth
  app.post("/api/*", authMiddleware, requireAdmin, (req, res, next) => {
    next();
  });
  
  app.put("/api/*", authMiddleware, requireAdmin, (req, res, next) => {
    next();
  });
  
  app.delete("/api/*", authMiddleware, requireAdmin, (req, res, next) => {
    next();
  });
  
  // Upload endpoint specifically requires admin
  app.post("/api/upload", authMiddleware, requireAdmin);
}

module.exports = { setupAuthentication };

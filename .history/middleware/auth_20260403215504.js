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
  
  // Custom authentication function to ensure strict password validation
  function customAuthorizer(username, password) {
    if (!username || !password) {
      return false;
    }
    
    const expectedPassword = users[username];
    if (!expectedPassword) {
      return false;
    }
    
    // Strict comparison to prevent timing attacks and ensure exact match
    return password === expectedPassword;
  }
  
  const authMiddleware = basicAuth({
    challenge: true,
    realm: 'Admin Access Required',
    authorizer: customAuthorizer,
    unauthorizedResponse: (req) => {
      return {
        status: 401,
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid username or password'
        })
      };
    }
  });
  
  // Custom middleware to check admin role
  const requireAdmin = (req, res, next) => {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in with admin credentials' 
      });
    }
    
    // Verify the user exists in our users object (double-check)
    if (!users[req.auth.user]) {
      return res.status(401).json({ 
        error: 'Invalid user',
        message: 'User not recognized' 
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
  
  // Clean URLs - serve HTML files without .html extension
  const publicPath = require("path").join(__dirname, "..", "public");
  
  // Map clean URL paths to their HTML files
  const cleanUrlRoutes = {
    '/dashboard': 'dashboard.html',
    '/player': 'player.html'
    // Note: /universal-streamer and /youtube-streamer are handled separately with auth protection
  };
  
  Object.entries(cleanUrlRoutes).forEach(([route, file]) => {
    app.get(route, (req, res) => {
      res.sendFile(require("path").join(publicPath, file));
    });
  });
  
  // Protected pages - require admin authentication
  const protectedPages = {
    '/universal-streamer': 'universal-streamer.html',
    '/youtube-streamer': 'youtube-streamer.html'  // Also protect deprecated page for consistency
  };
  
  Object.entries(protectedPages).forEach(([route, file]) => {
    app.get(route, authMiddleware, requireAdmin, (req, res) => {
      res.sendFile(require("path").join(publicPath, file));
    });
  });
  
  // Redirect .html URLs to clean URLs (SEO-friendly redirect)
  app.get(/^(.*)\.html$/, (req, res) => {
    const cleanUrl = req.path.replace(/\.html$/, '');
    
    // Check if this is a protected page
    const protectedPages = ['/universal-streamer', '/youtube-streamer'];
    if (protectedPages.includes(cleanUrl)) {
      // For protected pages, apply authentication before redirect
      authMiddleware(req, res, () => {
        requireAdmin(req, res, () => {
          res.redirect(301, cleanUrl);
        });
      });
    } else {
      // For public pages, redirect without auth
      res.redirect(301, cleanUrl);
    }
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
  
  // Debug endpoints also require admin authentication
  app.use("/__debug", authMiddleware, requireAdmin);
}

module.exports = { setupAuthentication };

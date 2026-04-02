const express = require("express");
const basicAuth = require("express-basic-auth");

/**
 * Setup authentication middleware for admin routes
 */
function setupAuthentication(app) {
  const authMiddleware = basicAuth({
    users: { admin: "@!JKF3eWd12" },
    challenge: true
  });
  
  // Apply auth to dashboard (root)
  app.get("/", authMiddleware, (req, res) => {
    res.sendFile(require("path").join(__dirname, "..", "public", "dashboard.html"));
  });
  
  // Apply auth to all /api routes
  app.use("/api", authMiddleware);
}

module.exports = { setupAuthentication };

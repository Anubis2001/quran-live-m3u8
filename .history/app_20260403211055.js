const express = require("express");
const basicAuth = require("express-basic-auth");
const path = require("path");
const fs = require("fs");

// Import routes
const streamsRoutes = require("./routes/streams");
const uploadRoutes = require("./routes/upload");
const diagnosticRoutes = require("./routes/diagnostics");

// Import middleware
const { setupStaticFileServing, setupSecurityHardening } = require("./middleware/staticServing");
const { setupAuthentication } = require("./middleware/auth");

// Import services
const { restoreStreams } = require("./services/streamService");

/**
 * Initialize Express application
 */
function createApp() {
  const app = express();
  
  // Basic middleware
  app.use(express.json());
  
  // Setup authentication FIRST (includes clean URL routes)
  setupAuthentication(app);
  
  // Setup static file serving for assets (CSS, JS, images)
  setupStaticFileServing(app);
  
  // Setup security hardening (block sensitive files/directories)
  setupSecurityHardening(app);
  
  // Mount routes
  app.use("/api/streams", streamsRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use("/__debug", diagnosticRoutes);
  
  return app;
}

module.exports = { createApp };

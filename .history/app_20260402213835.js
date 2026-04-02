const express = require("express");
const basicAuth = require("express-basic-auth");
const path = require("path");
const fs = require("fs");

// Import routes
const streamsRoutes = require("./routes/streams");
const uploadRoutes = require("./routes/upload");
const diagnosticRoutes = require("./routes/diagnostics");

// Import middleware
const { setupStaticFileServing } = require("./middleware/staticServing");
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
  
  // Setup static file serving (must be before auth)
  setupStaticFileServing(app);
  
  // Setup authentication for protected routes
  setupAuthentication(app);
  
  // Mount routes
  app.use("/api/streams", streamsRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use("/__debug", diagnosticRoutes);
  
  return app;
}

module.exports = { createApp };

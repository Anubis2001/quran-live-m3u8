const express = require("express");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

// Import routes
const streamsRoutes = require("./routes/streams");
const uploadRoutes = require("./routes/upload");
const diagnosticRoutes = require("./routes/diagnostics");
const authRoutes = require("./routes/auth");

// Import middleware
const { setupStaticFileServing, setupSecurityHardening } = require("./middleware/staticServing");
const { initializeSecurity } = require("./middleware/security");

// Import services
const { restoreStreams } = require("./services/streamService");

/**
 * Initialize Express application
 */
function createApp() {
  const app = express();
  
  // Basic middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  
  // Setup security middleware (helmet, rate limiting, sanitization)
  initializeSecurity(app);
  
  // Setup session management with secure cookies
  app.use(session({
    name: 'sessionId', // Generic name for security
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production-' + Math.random().toString(36),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
  
  // Setup static file serving for assets (CSS, JS, images)
  setupStaticFileServing(app);
  
  // Setup security hardening (block sensitive files/directories)
  setupSecurityHardening(app);
  
  // Mount API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/streams", streamsRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use("/__debug", diagnosticRoutes);
  
  return app;
}

module.exports = { createApp };

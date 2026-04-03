const express = require("express");
const path = require("path");
const fs = require("fs");

/**
 * Setup static file serving for streams and public content
 */
function setupStaticFileServing(app) {
  const streamsPath = path.join(__dirname, "..", "streams");
  
  console.log(`Setting up static file serving for streams directory`);
  
  // Handle individual stream files explicitly
  app.get("/streams/:streamName/:filename", (req, res) => {
    const streamName = req.params.streamName;
    const filename = req.params.filename;
    const filePath = path.join(streamsPath, streamName, filename);
    
    console.log(`Stream file request: ${streamName}/${filename}`);
    
    // CRITICAL: Check for path traversal attacks
    const resolvedStreamsPath = path.resolve(streamsPath);
    const resolvedFilePath = path.resolve(filePath);
    
    // Prevent path traversal attacks
    if (!resolvedFilePath.startsWith(resolvedStreamsPath)) {
      console.error(`⚠️ BLOCKED: Path traversal attempt detected`);
      return res.status(403).json({
        error: 'Access denied',
        message: 'Invalid file path'
      });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The requested stream file does not exist'
      });
    }
    
    console.log(`Sending stream file...`);
    
    // Set proper MIME types
    if (filename.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    } else if (filename.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    
    // Allow CORS for external access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache'); // Don't cache HLS playlists
    
    // Send the file
    console.log(`Stream file: ${streamName}/${filename}`);
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`Error sending stream file:`, err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error sending file' });
        }
      } else {
        console.log(`Stream file sent`);
      }
    });
  });
  
  // Also keep the static middleware for segment files
  console.log(`Setting up static middleware for /streams route`);
  app.use("/streams", express.static(streamsPath, {
    dotfiles: 'ignore',
    etag: true,
    extensions: ['m3u8', 'ts'],
    immutable: false,
    maxAge: '1s',
    redirect: false,
    setHeaders: (res, path, stat) => {
      console.log(`Static middleware serving: ${path}`);
      if (path.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (path.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
    fallthrough: true // Continue to next middleware if file not found
  }));
  
  // Serve public folder for static assets (CSS, JS, images, etc.)
  // Note: HTML files are handled by auth.js routes for clean URLs
  app.use(express.static(path.join(__dirname, "..", "public"), {
    extensions: [],  // Don't auto-append extensions for HTML files
    index: false     // Don't serve index.html automatically
  }));
}

/**
 * Block access to sensitive directories and files
 */
function setupSecurityHardening(app) {
  const cookiesPath = path.join(__dirname, "..", "cookies");
  
  // Ensure cookies directory exists with proper permissions
  if (!require("fs").existsSync(cookiesPath)) {
    require("fs").mkdirSync(cookiesPath, { recursive: true });
    console.log(`✓ Created secure cookies directory: ${cookiesPath}`);
  }
  
  // CRITICAL: Block any attempts to access sensitive directories or files
  app.use((req, res, next) => {
    const requestedPath = req.path.toLowerCase();
    
    // Block access to sensitive directories
    const blockedPaths = [
      '/middleware',
      '/routes',
      '/services',
      '/utils',
      '/node_modules',
      '/.git',
      '/.history',
      '/logs',
      '/uploads',
      '/cookies'  // Never expose cookies directory
    ];
    
    // Block access to sensitive file types
    const blockedExtensions = [
      '.js',           // Don't serve source files
      '.json',         // Don't serve JSON config files
      '.log',          // Don't serve log files
      '.env',          // Never expose environment files
      '.txt',          // Block text files (including cookies)
      '.bak',          // Backup files
      '.swp',          // Swap files
    ];
    
    // Exception: Allow .html files to be accessed (they will be redirected to clean URLs by auth.js)
    
    // Check if path is blocked
    if (blockedPaths.some(blocked => requestedPath.startsWith(blocked))) {
      console.warn(`⚠️ BLOCKED: Access attempt to restricted path: ${requestedPath}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied'
      });
    }
    
    // Check if file extension is blocked
    if (blockedExtensions.some(ext => requestedPath.endsWith(ext))) {
      console.warn(`⚠️ BLOCKED: Access attempt to restricted file type: ${requestedPath}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'File type not accessible'
      });
    }
    
    next();
  });
}

module.exports = { setupStaticFileServing, setupSecurityHardening };

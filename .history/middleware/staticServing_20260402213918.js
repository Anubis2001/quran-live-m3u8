const express = require("express");
const path = require("path");
const fs = require("fs");

/**
 * Setup static file serving for streams and public content
 */
function setupStaticFileServing(app) {
  const streamsPath = path.join(__dirname, "..", "streams");
  
  console.log(`Setting up static file serving for streams directory: ${streamsPath}`);
  console.log(`Streams path exists: ${fs.existsSync(streamsPath)}`);
  
  // Handle individual stream files explicitly
  app.get("/streams/:streamName/:filename", (req, res) => {
    const streamName = req.params.streamName;
    const filename = req.params.filename;
    const filePath = path.join(streamsPath, streamName, filename);
    
    console.log(`\n========== STREAM FILE REQUEST ==========`);
    console.log(`Request URL: ${req.originalUrl}`);
    console.log(`Request path: ${req.path}`);
    console.log(`Params - streamName: ${streamName}, filename: ${filename}`);
    console.log(`Full requested path: ${filePath}`);
    console.log(`Base streams path: ${streamsPath}`);
    console.log(`__dirname: ${__dirname}`);
    console.log(`File exists: ${fs.existsSync(filePath)}`);
    
    // CRITICAL: Check for path traversal attacks
    const normalizedPath = path.normalize(filePath);
    console.log(`Normalized path: ${normalizedPath}`);
    console.log(`Path starts with streamsPath: ${normalizedPath.startsWith(path.resolve(streamsPath))}`);
    
    // Debug: List what's actually in the stream directory
    try {
      const streamDir = path.join(streamsPath, streamName);
      console.log(`Stream directory: ${streamDir}`);
      console.log(`Stream dir exists: ${fs.existsSync(streamDir)}`);
      
      if (fs.existsSync(streamDir)) {
        const files = fs.readdirSync(streamDir);
        console.log(`Files in ${streamDir}:`, files);
        console.log(`Looking for: ${filename}`);
        console.log(`Exact match found: ${files.includes(filename)}`);
        
        // Case-insensitive search
        const lowerFilename = filename.toLowerCase();
        const caseInsensitiveMatch = files.find(f => f.toLowerCase() === lowerFilename);
        if (caseInsensitiveMatch && caseInsensitiveMatch !== filename) {
          console.warn(`⚠️ CASE MISMATCH: Requested '${filename}' but found '${caseInsensitiveMatch}'`);
          console.warn(`This might be a case-sensitivity issue!`);
        }
        
        // Check for similar filenames
        const matchingFiles = files.filter(f => 
          f.toLowerCase().includes(lowerFilename) ||
          f.toLowerCase().includes('stream') ||
          f.toLowerCase().includes('.m3u8')
        );
        if (matchingFiles.length > 0 && matchingFiles.length <= 5) {
          console.log(`Similar files found:`, matchingFiles);
        }
      } else {
        console.error(`Stream directory does NOT exist: ${streamDir}`);
        // List parent directory contents
        const parentDir = path.dirname(streamDir);
        if (fs.existsSync(parentDir)) {
          const parentFiles = fs.readdirSync(parentDir);
          console.log(`Parent directory (${parentDir}) contents:`, parentFiles);
        }
      }
    } catch (dirErr) {
      console.error(`Error listing directory:`, dirErr.message);
    }
    
    if (!fs.existsSync(filePath)) {
      console.error(`\n❌ File NOT found: ${filePath}`);
      
      // CRITICAL DEBUGGING: List what SHOULD be there
      const diagnosticInfo = {
        error: "Stream file not found",
        requestedPath: filePath,
        streamName: streamName,
        filename: filename,
        basePath: streamsPath,
        dirname: __dirname,
        cwd: process.cwd(),
        diagnostics: {}
      };
      
      try {
        const streamDir = path.join(streamsPath, streamName);
        diagnosticInfo.diagnostics.streamDirExists = fs.existsSync(streamDir);
        diagnosticInfo.diagnostics.streamDir = streamDir;
        
        if (fs.existsSync(streamDir)) {
          const files = fs.readdirSync(streamDir);
          diagnosticInfo.diagnostics.availableFiles = files.map(f => {
            const fp = path.join(streamDir, f);
            const stats = fs.statSync(fp);
            return { name: f, size: stats.size, isDirectory: stats.isDirectory() };
          });
          
          // Check for case sensitivity issues
          const lowerFilename = filename.toLowerCase();
          const caseMatch = files.find(f => f.toLowerCase() === lowerFilename);
          if (caseMatch && caseMatch !== filename) {
            diagnosticInfo.diagnostics.caseMismatch = {
              requested: filename,
              actual: caseMatch,
              message: 'Case sensitivity mismatch - Linux is case-sensitive!'
            };
          }
        } else {
          // Parent dir exists?
          const parentDir = path.dirname(streamDir);
          diagnosticInfo.diagnostics.parentDirExists = fs.existsSync(parentDir);
          if (fs.existsSync(parentDir)) {
            diagnosticInfo.diagnostics.parentContents = fs.readdirSync(parentDir);
          }
        }
      } catch (diagErr) {
        diagnosticInfo.diagnostics.error = diagErr.message;
      }
      
      console.error('\n========== DIAGNOSTIC INFO ==========');
      console.error(JSON.stringify(diagnosticInfo.diagnostics, null, 2));
      console.error('=====================================\n');
      
      return res.status(404).json(diagnosticInfo);
    }
    
    console.log(`\n✓ File found, preparing to send...`);
    
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
    console.log(`Sending file: ${filePath}`);
    console.log(`=========================================\n`);
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`Error sending file:`, err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error sending file', details: err.message });
        }
      } else {
        console.log(`File sent successfully: ${filePath}`);
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
  
  // Serve public folder (dashboard.html, client.js, etc.) WITHOUT auth for scripts
  app.use(express.static(path.join(__dirname, "..", "public")));
}

module.exports = { setupStaticFileServing };

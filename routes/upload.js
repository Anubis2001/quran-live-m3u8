const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { startStream } = require("../services/streamService");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/**
 * POST /api/upload - Upload and start a new stream
 */
router.post("/", upload.single("audio"), (req, res) => {
  console.log('Upload request received:', req.body, req.file);
  
  if (!req.file) {
    console.error('No file received in upload');
    return res.status(400).json({ error: "No audio file received" });
  }

  try {
    const raw = req.body.name || "";
    const name = raw.trim().replace(/[^a-z0-9\\-]/gi, "_");
    
    console.log('Processing upload for stream name:', name);
    
    if (!name) {
      console.error('Stream name is empty after sanitization');
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Stream name is required" });
    }
    
    // Load existing metadata
    const STREAMS_DB_FILE = path.join(__dirname, "..", "streams.json");
    let streamsMetadata = [];
    if (fs.existsSync(STREAMS_DB_FILE)) {
      streamsMetadata = JSON.parse(fs.readFileSync(STREAMS_DB_FILE, 'utf8'));
    }
    
    // Check if stream already exists
    if (streamsMetadata.some(s => s.name === name)) {
      console.error('Stream already exists:', name);
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "A stream with this name already exists" });
    }
    
    const streamDir = path.join(__dirname, "..", "streams", name);
    console.log('Creating stream directory:', streamDir);
    fs.mkdirSync(streamDir, { recursive: true });

    const finalPath = path.join(streamDir, req.file.originalname);
    console.log('Moving file from', req.file.path, 'to', finalPath);
    
    fs.renameSync(req.file.path, finalPath);
    console.log('File moved successfully');

    // Add to metadata and save
    const streamData = {
      name: name,
      filePath: finalPath,
      createdAt: new Date().toISOString()
    };
    streamsMetadata.push(streamData);
    console.log('Saving metadata to', STREAMS_DB_FILE);
    fs.writeFileSync(STREAMS_DB_FILE, JSON.stringify(streamsMetadata, null, 2), 'utf8');
    console.log('Metadata saved successfully');

    console.log('Starting FFmpeg process for stream:', name);
    startStream(name, finalPath);
    
    // Wait for FFmpeg to create the initial playlist file (up to 2 seconds)
    console.log(`Waiting for stream.m3u8 to be created in ${streamDir}...`);
    let waitForPlaylist = 0;
    const maxWaitTime = 2000; // 2 seconds
    const checkInterval = 500; // Check every 500ms
    
    const waitForPlaylistCreation = () => {
      return new Promise((resolve) => {
        const checkPlaylist = setInterval(() => {
          const playlistPath = path.join(streamDir, 'stream.m3u8');
          if (fs.existsSync(playlistPath)) {
            console.log(`✓ stream.m3u8 created successfully after ${waitForPlaylist}ms`);
            clearInterval(checkPlaylist);
            resolve(true);
          } else {
            waitForPlaylist += checkInterval;
            if (waitForPlaylist >= maxWaitTime) {
              console.warn(`⚠ stream.m3u8 not created after ${maxWaitTime}ms, continuing anyway`);
              clearInterval(checkPlaylist);
              resolve(false);
            }
          }
        }, checkInterval);
      });
    };
    
    // Wait for playlist to be created before responding
    waitForPlaylistCreation().then(() => {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const response = { 
        success: true,
        message: "Stream created successfully",
        streamUrl: `${baseUrl}/streams/${name}/stream.m3u8` 
      };
      console.log('Upload completed successfully:', response);
      res.json(response);
    });
    
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process upload: " + error.message });
  }
});

module.exports = router;

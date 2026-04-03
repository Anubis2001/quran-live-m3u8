const express = require("express");
const router = express.Router();
const { 
  listStreams, 
  startStream, 
  stopStream, 
  deleteStream,
  renameStream,
  getRunningStreams,
  startYoutubeStream
} = require("../services/streamService");
const { protectWriteOperations } = require('./routeProtection');

/**
 * POST /api/streams/test-auth - Test authentication (admin only)
 * This endpoint exists solely to verify admin credentials
 */
router.post("/test-auth", protectWriteOperations, (req, res) => {
  // If this endpoint is reached, authentication succeeded (middleware verified it)
  res.json({
    success: true,
    message: 'Authentication successful',
    user: req.user
  });
});

/**
 * PUT /api/streams/:name/rename - Rename a stream (supports Arabic characters)
 * Body: { newName: "New Stream Name" or "اسم_جديد" }
 */
router.put("/:name/rename", protectWriteOperations, async (req, res) => {
  const currentName = req.params.name;
  const { newName } = req.body;
  
  if (!newName || !newName.trim()) {
    return res.status(400).json({ 
      error: 'Invalid new name',
      message: 'New stream name is required'
    });
  }
  
  try {
    const result = await renameStream(currentName, newName.trim());
    
    if (result.success) {
      res.json({
        success: true,
        message: `Stream renamed successfully`,
        oldName: currentName,
        newName: result.newName,
        url: result.url
      });
    } else {
      res.status(404).json({ 
        error: result.error || 'Failed to rename stream'
      });
    }
  } catch (error) {
    console.error(`Error renaming stream:`, error);
    res.status(500).json({ error: `Error: ${error.message}` });
  }
});

/**
 * GET /api/streams - List all streams with status
 */
router.get("/", (req, res) => {
  const streams = listStreams(req);
  res.json(streams);
});

/**
 * POST /api/streams/:name/start - Start a stream
 */
router.post("/:name/start", protectWriteOperations, (req, res) => {
  const folder = require("path").join(__dirname, "..", "streams", req.params.name);
  const mp3 = require("fs").existsSync(folder)
    ? require("fs").readdirSync(folder).find(f => f.endsWith(".mp3"))
    : null;
    
  if (!mp3) return res.status(404).send("Not found or no mp3");
  
  // Stop existing process if any before starting new one
  stopStream(req.params.name);
  
  startStream(req.params.name, require("path").join(folder, mp3));
  res.send("Started");
});

/**
 * POST /api/streams/youtube/:name - Start a universal audio stream (supports YouTube, Instagram, SoundCloud, etc.)
 * Body: { url: "https://youtube.com/watch?v=...", cookies?: "/path/to/cookies.txt" }
 */
router.post("/youtube/:name", protectWriteOperations, async (req, res) => {
  const { url, cookies } = req.body;
  const name = req.params.name;
  
  // Validate stream name (alphanumeric, hyphens, underscores only)
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ 
      error: 'Invalid stream name',
      message: 'Stream name can only contain letters, numbers, hyphens, and underscores'
    });
  }
  
  // Validate URL
  if (!url) {
    return res.status(400).send("Media URL is required in request body as 'url'");
  }
  
  // Basic URL validation
  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  
  console.log(`\n🎵 Universal stream request for: ${name}`);
  console.log(`Processing request...`);
  
  try {
    // Stop existing stream with same name
    stopStream(name);
    
    // Start universal audio extraction and streaming
    const result = await startYoutubeStream(name, url, cookies);
    
    if (result.success) {
      // Use x-forwarded-host to preserve original domain
      const baseUrl = `${req.protocol}://${req.get("x-forwarded-host") || req.get("host")}`;
      res.json({
        success: true,
        message: `Audio stream started successfully`,
        platform: result.platform || 'Unknown',
        cookiesUsed: result.cookiesUsed || false,
        streamUrl: `${baseUrl}/streams/${name}/stream.m3u8`,
        name: name
      });
    } else {
      res.status(500).json({ 
        error: result.error || 'Failed to start stream',
        requiresCookies: result.requiresCookies || false,
        cookiesProvided: result.cookiesProvided || false
      });
    }
  } catch (error) {
    console.error(`Error starting universal stream:`, error);
    res.status(500).json({ error: `Error: ${error.message}` });
  }
});

/**
 * POST /api/streams/:name/stop - Stop a stream
 */
router.post("/:name/stop", protectWriteOperations, (req, res) => {
  console.log(`Stop request received for stream: ${req.params.name}`);
  const result = stopStream(req.params.name);
  
  // Wait a moment to ensure process termination completes
  setTimeout(() => {
    if (result) {
      res.send("Stopped");
    } else {
      res.status(404).send("Stream not found or not running");
    }
  }, 500);
});

/**
 * DELETE /api/streams/:name - Delete a stream
 */
router.delete("/:name", protectWriteOperations, (req, res) => {
  const name = req.params.name;
  console.log(`Delete request received for stream: ${name}`);
  
  deleteStream(name)
    .then(() => {
      res.send("Deleted");
    })
    .catch((err) => {
      console.error(`Error deleting stream ${name}:`, err);
      res.status(500).send("Error deleting stream");
    });
});

module.exports = router;

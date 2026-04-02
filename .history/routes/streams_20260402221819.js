const express = require("express");
const router = express.Router();
const { 
  listStreams, 
  startStream, 
  stopStream, 
  deleteStream,
  getRunningStreams,
  startYoutubeStream
} = require("../services/streamService");

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
router.post("/:name/start", (req, res) => {
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
 * POST /api/streams/youtube/:name - Start a YouTube audio stream
 * Body: { url: "https://youtube.com/watch?v=...", cookies?: "/path/to/cookies.txt" }
 */
router.post("/youtube/:name", async (req, res) => {
  const { url, cookies } = req.body;
  const name = req.params.name;
  
  if (!url) {
    return res.status(400).send("YouTube URL is required in request body as 'url'");
  }
  
  console.log(`\n🎵 YouTube stream request for: ${name}`);
  console.log(`URL: ${url}`);
  if (cookies) {
    console.log(`Cookies file: ${cookies}`);
  }
  console.log();
  
  try {
    // Stop existing stream with same name
    stopStream(name);
    
    // Start YouTube audio extraction and streaming
    const result = await startYoutubeStream(name, url, cookies);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'YouTube audio stream started successfully',
        streamUrl: `${req.protocol}://${req.get("host")}/streams/${name}/stream.m3u8`,
        name: name,
        authenticated: !!cookies
      });
    } else {
      res.status(500).send(result.error || 'Failed to start YouTube stream');
    }
  } catch (error) {
    console.error(`Error starting YouTube stream:`, error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

/**
 * POST /api/streams/:name/stop - Stop a stream
 */
router.post("/:name/stop", (req, res) => {
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
router.delete("/:name", (req, res) => {
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

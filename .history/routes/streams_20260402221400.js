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

const express = require("express");
const basicAuth = require("express-basic-auth");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// make sure uploads folder exists
if (!fs.existsSync(path.join(__dirname, "uploads"))) {
  fs.mkdirSync(path.join(__dirname, "uploads"));
}

// PUBLIC: serve .m3u8 and .ts files without auth
app.use("/streams", express.static(path.join(__dirname, "streams")));

// ADMIN AUTH only for dashboard and API
// Explicitly serve dashboard at "/" with auth
app.get("/", basicAuth({
  users: { admin: "@!JKF3eWd12" },
  challenge: true
}), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Apply basic auth to all /api routes
app.use("/api", basicAuth({
  users: { admin: "@!JKF3eWd12" },
  challenge: true
}));

const upload = multer({ dest: "uploads/" });
const runningStreams = {};
const STREAMS_DB_FILE = path.join(__dirname, "streams.json");

// Load streams metadata from persistent storage
function loadStreamsMetadata() {
  try {
    if (fs.existsSync(STREAMS_DB_FILE)) {
      const data = fs.readFileSync(STREAMS_DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading streams metadata:', err);
  }
  return [];
}

// Save streams metadata to persistent storage
function saveStreamsMetadata(streamsArray) {
  try {
    fs.writeFileSync(STREAMS_DB_FILE, JSON.stringify(streamsArray, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving streams metadata:', err);
    return false;
  }
}

// restore streams after a restart
function restoreStreams() {
  const streamsMetadata = loadStreamsMetadata();
  
  // First, check for any existing streams in the streams folder (legacy support)
  const base = path.join(__dirname, "streams");
  if (fs.existsSync(base)) {
    fs.readdirSync(base).forEach(name => {
      const folder = path.join(base, name);
      if (!fs.lstatSync(folder).isDirectory()) return;
      const mp3 = fs.readdirSync(folder).find(f => f.endsWith(".mp3"));
      if (mp3) {
        // Check if this stream is already in metadata
        const existsInMetadata = streamsMetadata.some(s => s.name === name);
        if (!existsInMetadata) {
          // Add legacy streams to metadata
          streamsMetadata.push({
            name: name,
            filePath: path.join(folder, mp3),
            createdAt: new Date().toISOString()
          });
        }
      }
    });
  }
  
  // Save updated metadata (including any legacy streams found)
  saveStreamsMetadata(streamsMetadata);
  
  // Start all streams from metadata
  streamsMetadata.forEach(streamData => {
    if (fs.existsSync(streamData.filePath)) {
      startStream(streamData.name, streamData.filePath);
      console.log(`Restored stream: ${streamData.name}`);
    } else {
      console.warn(`Stream file not found: ${streamData.filePath}`);
    }
  });
}

// list streams with status
app.get("/api/streams", (req, res) => {
  const streamsMetadata = loadStreamsMetadata();
  const list = streamsMetadata.map(streamData => {
    const entry = runningStreams[streamData.name];
    const alive = entry && entry.process.exitCode === null;
    return { 
      name: streamData.name, 
      status: alive ? "running" : streamData.failed ? "failed" : "stopped",
      url: `${req.protocol}://${req.get("host")}/streams/${streamData.name}/stream.m3u8`
    };
  });
  res.json(list);
});

// upload & start stream
app.post("/api/upload", upload.single("audio"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file received" });
  }

  try {
    const raw = req.body.name || "";
    const name = raw.trim().replace(/[^a-z0-9\\-]/gi, "_");
    
    if (!name) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Stream name is required" });
    }
    
    // Check if stream already exists in metadata
    const streamsMetadata = loadStreamsMetadata();
    if (streamsMetadata.some(s => s.name === name)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "A stream with this name already exists" });
    }
    
    const streamDir = path.join(__dirname, "streams", name);
    fs.mkdirSync(streamDir, { recursive: true });

    const finalPath = path.join(streamDir, req.file.originalname);
    
    fs.renameSync(req.file.path, finalPath);

    // Add to metadata and save
    const streamData = {
      name: name,
      filePath: finalPath,
      createdAt: new Date().toISOString()
    };
    streamsMetadata.push(streamData);
    saveStreamsMetadata(streamsMetadata);

    startStream(name, finalPath);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({ 
      success: true,
      message: "Stream created successfully",
      streamUrl: `${baseUrl}/streams/${name}/stream.m3u8` 
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process upload: " + error.message });
  }
});

// start one
app.post("/api/streams/:name/start", (req, res) => {
  const folder = path.join(__dirname, "streams", req.params.name);
  const mp3 = fs.existsSync(folder)
    ? fs.readdirSync(folder).find(f => f.endsWith(".mp3"))
    : null;
  if (!mp3) return res.status(404).send("Not found or no mp3");
  startStream(req.params.name, path.join(folder, mp3));
  res.send("Started");
});

// stop one
app.post("/api/streams/:name/stop", (req, res) => {
  stopStream(req.params.name);
  res.send("Stopped");
});

// delete one
app.delete("/api/streams/:name", (req, res) => {
  const name = req.params.name;
  stopStream(name);
  const folder = path.join(__dirname, "streams", name);
  fs.rmSync(folder, { recursive: true, force: true });
  
  // Remove from metadata
  const streamsMetadata = loadStreamsMetadata();
  const filteredMetadata = streamsMetadata.filter(s => s.name !== name);
  saveStreamsMetadata(filteredMetadata);
  
  res.send("Deleted");
});

// FFmpeg HLS loop
function startStream(name, filePath) {
  if (runningStreams[name] && runningStreams[name].process.exitCode === null) return;

  const dir = path.dirname(filePath);
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-re",
      "-stream_loop", "-1",
      "-i", filePath,
      "-c:a", "copy",
      "-hls_time", "4",
      "-hls_list_size", "5",
      "-hls_flags", "delete_segments",
      "-hls_segment_filename",
      `${dir}/seg_%03d.ts`,
      `${dir}/stream.m3u8`,
    ],
    { detached: true, stdio: "ignore" }
  );

  ffmpeg.unref();
  runningStreams[name] = { process: ffmpeg, failed: false };
  
  ffmpeg.on("error", (err) => {
    console.error(`FFmpeg error for stream ${name}:`, err);
    if (runningStreams[name]) {
      runningStreams[name].failed = true;
      // Update metadata with failed status
      const streamsMetadata = loadStreamsMetadata();
      const streamIndex = streamsMetadata.findIndex(s => s.name === name);
      if (streamIndex !== -1) {
        streamsMetadata[streamIndex].failed = true;
        saveStreamsMetadata(streamsMetadata);
      }
    }
  });
  
  ffmpeg.on("exit", code => {
    if (code !== 0) {
      console.error(`FFmpeg exited with code ${code} for stream ${name}`);
      if (runningStreams[name]) {
        runningStreams[name].failed = true;
        // Update metadata with failed status
        const streamsMetadata = loadStreamsMetadata();
        const streamIndex = streamsMetadata.findIndex(s => s.name === name);
        if (streamIndex !== -1) {
          streamsMetadata[streamIndex].failed = true;
          saveStreamsMetadata(streamsMetadata);
        }
      }
    }
  });
}

function stopStream(name) {
  const ent = runningStreams[name];
  if (ent) {
    try { ent.process.kill(); } catch {}
    delete runningStreams[name];
  }
}

restoreStreams();
const PORT = process.env.PORT || 8300;
app.listen(PORT, () => console.log("Server running on port " + PORT));
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

// Serve public folder (dashboard.html, client.js, etc.) WITHOUT auth for scripts
// Note: Dashboard itself is protected via route below
app.use(express.static(path.join(__dirname, "public")));

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

// Check if FFmpeg is available
const { execSync } = require("child_process");
try {
  execSync("ffmpeg -version", { stdio: "ignore" });
  console.log("✓ FFmpeg is installed and available");
} catch (err) {
  console.error("✗ FFmpeg is not installed or not in PATH");
  console.error("Please install FFmpeg from https://ffmpeg.org/download.html");
}

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
      url: `${req.protocol}://${req.get("host")}/streams/${streamData.name}/stream.m3u8`,
      createdAt: streamData.createdAt
    };
  });
  res.json(list);
});

// upload & start stream
app.post("/api/upload", upload.single("audio"), (req, res) => {
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
    
    // Check if stream already exists in metadata
    const streamsMetadata = loadStreamsMetadata();
    if (streamsMetadata.some(s => s.name === name)) {
      console.error('Stream already exists:', name);
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "A stream with this name already exists" });
    }
    
    const streamDir = path.join(__dirname, "streams", name);
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
    saveStreamsMetadata(streamsMetadata);
    console.log('Metadata saved successfully');

    console.log('Starting FFmpeg process for stream:', name);
    startStream(name, finalPath);
    console.log('FFmpeg process started');

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const response = { 
      success: true,
      message: "Stream created successfully",
      streamUrl: `${baseUrl}/streams/${name}/stream.m3u8` 
    };
    console.log('Upload completed successfully:', response);
    res.json(response);
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
  
  // Stop existing process if any before starting new one
  stopStream(req.params.name);
  
  startStream(req.params.name, path.join(folder, mp3));
  res.send("Started");
});

// stop one
app.post("/api/streams/:name/stop", (req, res) => {
  const result = stopStream(req.params.name);
  if (result) {
    res.send("Stopped");
  } else {
    res.status(404).send("Stream not found or not running");
  }
});

// delete one
app.delete("/api/streams/:name", (req, res) => {
  const name = req.params.name;
  // Always stop the stream first to kill FFmpeg process
  stopStream(name);
  const folder = path.join(__dirname, "streams", name);
  fs.rmSync(folder, { recursive: true, force: true });
  
  // Remove from metadata
  const streamsMetadata = loadStreamsMetadata();
  const filteredMetadata = streamsMetadata.filter(s => s.name !== name);
  saveStreamsMetadata(filteredMetadata);
  
  res.send("Deleted");
});

// FFmpeg HLS loop - uses exact command pattern:
// ffmpeg -re -stream_loop -1 -i [input] -c:a copy -hls_time 4 -hls_list_size 5 -hls_flags delete_segments -hls_segment_filename [output-dir]/seg_%03d.ts [output-dir]/stream.m3u8
function startStream(name, filePath) {
  console.log(`Starting stream: ${name} with file: ${filePath}`);
  
  // First, ensure any existing process is completely stopped
  const existingEntry = runningStreams[name];
  if (existingEntry) {
    console.log(`Cleaning up existing process for ${name} before starting new one`);
    if (existingEntry.process && !existingEntry.process.killed) {
      try {
        // Send SIGTERM for graceful shutdown
        existingEntry.process.kill('SIGTERM');
        console.log(`Sent SIGTERM to existing process ${existingEntry.process.pid}`);
      } catch (err) {
        console.error(`Error killing existing process:`, err);
      }
    }
    // Remove reference immediately
    delete runningStreams[name];
  }
  
  // Wait a brief moment to ensure old process is cleaned up
  setTimeout(() => {
    const dir = path.dirname(filePath);
    console.log(`Output directory: ${dir}`);
    
    const ffmpegArgs = [
      "-re",                    // Read input at native frame rate
      "-stream_loop", "-1",     // Loop indefinitely
      "-i", filePath,           // Input MP3 file
      "-c:a", "copy",           // Copy audio codec (no re-encoding)
      "-hls_time", "4",         // Each segment is 4 seconds
      "-hls_list_size", "5",    // Keep 5 segments in playlist
      "-hls_flags", "delete_segments",  // Delete old segments
      "-hls_segment_filename", `${dir}/seg_%03d.ts`,  // Segment filename pattern
      `${dir}/stream.m3u8`      // Output playlist file
    ];
    
    console.log(`FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);
    
    const ffmpeg = spawn("ffmpeg", ffmpegArgs, { detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
    
    // Don't unref - keep reference so we can properly track and kill it
    // Store additional info for better process management
    runningStreams[name] = { 
      process: ffmpeg, 
      failed: false,
      startTime: new Date(),
      pid: ffmpeg.pid
    };
    
    console.log(`FFmpeg process spawned for stream ${name} with PID: ${ffmpeg.pid}`);
    
    // Capture stderr for debugging
    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('error') || msg.includes('Error')) {
        console.error(`FFmpeg stderr: ${msg}`);
      }
    });
    
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
      console.log(`FFmpeg exit handler called for ${name} with code ${code}`);
      
      // Clean up the entry when process exits
      if (runningStreams[name]) {
        if (code !== 0) {
          console.error(`FFmpeg exited with code ${code} for stream ${name}`);
          runningStreams[name].failed = true;
          // Update metadata with failed status
          const streamsMetadata = loadStreamsMetadata();
          const streamIndex = streamsMetadata.findIndex(s => s.name === name);
          if (streamIndex !== -1) {
            streamsMetadata[streamIndex].failed = true;
            saveStreamsMetadata(streamsMetadata);
          }
        } else {
          console.log(`FFmpeg process ended cleanly for stream ${name}`);
        }
        // Remove from running streams after it exits
        delete runningStreams[name];
      }
    });
  }, 100); // Small delay to ensure cleanup
}

// Improved stop function with proper process termination
function stopStream(name) {
  console.log(`Stopping stream: ${name}`);
  const ent = runningStreams[name];
  
  if (!ent) {
    console.log(`Stream ${name} not found in running processes`);
    return false;
  }
  
  try {
    const proc = ent.process;
    
    if (!proc || proc.killed) {
      console.log(`Process for ${name} already killed or invalid`);
      delete runningStreams[name];
      return false;
    }
    
    console.log(`Killing FFmpeg process ${name} (PID: ${proc.pid})`);
    
    // Send SIGTERM first for graceful shutdown
    try {
      proc.kill('SIGTERM');
      console.log(`Sent SIGTERM to process ${proc.pid}`);
    } catch (killErr) {
      console.error(`Error sending SIGTERM:`, killErr);
    }
    
    // Set a timeout to force kill if still running after 3 seconds
    const forceKillTimeout = setTimeout(() => {
      if (!proc.killed) {
        console.warn(`Process ${proc.pid} didn't terminate gracefully, force killing`);
        try {
          // On Windows, use taskkill to forcefully terminate the process tree
          if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            execSync(`taskkill /pid ${proc.pid} /T /F`);
          } else {
            proc.kill('SIGKILL');
          }
          console.log(`Force killed process ${proc.pid}`);
        } catch (forceErr) {
          console.error(`Error force killing process:`, forceErr);
        }
      }
    }, 3000);
    
    // Clean up immediately from our tracking
    delete runningStreams[name];
    
    console.log(`Stream ${name} stop initiated successfully`);
    return true;
    
  } catch (err) {
    console.error(`Error stopping stream ${name}:`, err);
    // Still remove from tracking even if there's an error
    delete runningStreams[name];
    return false;
  }
}

restoreStreams();
const PORT = process.env.PORT || 8300;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Accessible locally at: http://localhost:${PORT}`);
  console.log(`Accessible from network at: http://[your-ip]:${PORT}`);
});
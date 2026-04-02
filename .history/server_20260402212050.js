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

// PUBLIC: serve .m3u8 and .ts files without auth - MUST be before auth middleware
const streamsPath = path.join(__dirname, "streams");
console.log(`Setting up static file serving for streams directory: ${streamsPath}`);
console.log(`Streams path exists: ${fs.existsSync(streamsPath)}`);
console.log(`__dirname resolved to: ${__dirname}`);
console.log(`Process working directory: ${process.cwd()}`);

// Debug endpoint to check streams folder structure
app.get("/__debug/streams", (req, res) => {
  const debugInfo = {
    dirname: __dirname,
    cwd: process.cwd(),
    streamsPath: streamsPath,
    streamsExists: fs.existsSync(streamsPath),
    streams: []
  };
  
  if (fs.existsSync(streamsPath)) {
    const streamDirs = fs.readdirSync(streamsPath);
    streamDirs.forEach(dir => {
      const dirPath = path.join(streamsPath, dir);
      if (fs.lstatSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        const fileInfo = [];
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          try {
            const stats = fs.statSync(filePath);
            fileInfo.push({
              name: file,
              size: stats.size,
              modified: stats.mtime,
              isDirectory: stats.isDirectory()
            });
          } catch (err) {
            fileInfo.push({ name: file, error: err.message });
          }
        });
        debugInfo.streams.push({
          name: dir,
          path: dirPath,
          files: fileInfo
        });
      }
    });
  }
  
  res.json(debugInfo);
});

// Debug endpoint to check running FFmpeg processes
app.get("/__debug/ffmpeg", (req, res) => {
  const { execSync } = require('child_process');
  
  const debugInfo = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cwd: process.cwd(),
    user: process.env.USER || process.env.USERNAME || 'unknown',
    uid: process.getuid ? process.getuid() : 'N/A',
    gid: process.getgid ? process.getgid() : 'N/A',
    ffmpeg: {
      installed: false,
      version: null,
      path: null,
      processes: []
    },
    runningStreams: {}
  };
  
  // Check FFmpeg installation
  try {
    const version = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
    debugInfo.ffmpeg.installed = true;
    debugInfo.ffmpeg.version = version;
    debugInfo.ffmpeg.path = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
  } catch (err) {
    debugInfo.ffmpeg.error = err.message;
  }
  
  // List FFmpeg processes
  try {
    if (process.platform === 'win32') {
      const psOutput = execSync('tasklist /FI "IMAGENAME eq ffmpeg.exe"', { encoding: 'utf8' });
      debugInfo.ffmpeg.processes = psOutput.split('\n').filter(l => l.includes('ffmpeg'));
    } else {
      const psOutput = execSync('ps aux | grep ffmpeg | grep -v grep', { encoding: 'utf8' });
      debugInfo.ffmpeg.processes = psOutput.split('\n').filter(line => line.trim());
    }
  } catch (err) {
    debugInfo.ffmpeg.processError = err.message;
  }
  
  // Add running streams info
  Object.keys(runningStreams).forEach(name => {
    const stream = runningStreams[name];
    debugInfo.runningStreams[name] = {
      pid: stream.pid,
      alive: stream.process && !stream.process.killed,
      playlistExists: stream.outputPlaylist && fs.existsSync(stream.outputPlaylist),
      segmentExists: stream.outputSegment && fs.existsSync(path.dirname(stream.outputSegment)),
      outputDir: stream.outputPlaylist ? path.dirname(stream.outputPlaylist) : 'unknown'
    };
  });
  
  res.json(debugInfo);
});

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

// delete one
app.delete("/api/streams/:name", (req, res) => {
  const name = req.params.name;
  console.log(`Delete request received for stream: ${name}`);
  
  // Always stop the stream first to kill FFmpeg process
  stopStream(name);
  
  // Wait a moment to ensure process is killed before deleting files
  setTimeout(() => {
    try {
      const folder = path.join(__dirname, "streams", name);
      console.log(`Deleting folder: ${folder}`);
      fs.rmSync(folder, { recursive: true, force: true });
      
      // Remove from metadata
      const streamsMetadata = loadStreamsMetadata();
      const filteredMetadata = streamsMetadata.filter(s => s.name !== name);
      saveStreamsMetadata(filteredMetadata);
      
      console.log(`Stream ${name} deleted successfully`);
      res.send("Deleted");
    } catch (err) {
      console.error(`Error deleting stream ${name}:`, err);
      res.status(500).send("Error deleting stream");
    }
  }, 1000); // Wait 1 second to ensure process is fully terminated
});

// FFmpeg HLS loop - uses exact command pattern (Linux optimized):
// ffmpeg -re -stream_loop -1 -i [input] -c:a copy -hls_time 4 -hls_list_size 5 -hls_flags delete_segments -hls_segment_filename [output-dir]/seg_%03d.ts [output-dir]/stream.m3u8
function startStream(name, filePath) {
  console.log(`\n========== STARTING STREAM: ${name} ==========`);
  console.log(`Input file: ${filePath}`);
  
  // First, ensure any existing process is completely stopped
  const existingEntry = runningStreams[name];
  if (existingEntry) {
    console.log(`Cleaning up existing process for ${name} before starting new one`);
    if (existingEntry.process && !existingEntry.process.killed) {
      try {
        existingEntry.process.kill('SIGTERM');
        console.log(`Sent SIGTERM to existing process ${existingEntry.process.pid}`);
      } catch (err) {
        console.error(`Error killing existing process:`, err);
      }
    }
    delete runningStreams[name];
  }
  
  const dir = path.dirname(filePath);
  console.log(`Output directory: ${dir}`);
  
  // Verify input file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Input file does not exist: ${filePath}`);
    return;
  }
  
  console.log(`✓ Input file exists: ${filePath}`);
  
  // Build FFmpeg arguments for Linux
  const outputPlaylist = path.join(dir, 'stream.m3u8');
  const outputSegment = path.join(dir, 'seg_%03d.ts');
  
  const ffmpegArgs = [
    "-re",                           // Read input at native frame rate
    "-stream_loop", "-1",            // Loop indefinitely
    "-i", filePath,                  // Input MP3 file
    "-c:a", "copy",                  // Copy audio codec (no re-encoding)
    "-hls_time", "4",                // Each segment is 4 seconds
    "-hls_list_size", "5",           // Keep 5 segments in playlist
    "-hls_flags", "delete_segments", // Delete old segments
    "-hls_segment_filename", outputSegment,  // Segment filename pattern
    outputPlaylist                   // Output playlist file
  ];
  
  console.log(`\nFFmpeg command:`);
  console.log(`ffmpeg ${ffmpegArgs.join(' ')}`);
  console.log(`\nExpected outputs:`);
  console.log(`  Playlist: ${outputPlaylist}`);
  console.log(`  Segments: ${outputSegment}`);
  
  // CRITICAL: Check write permissions on output directory
  try {
    const testFile = path.join(dir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`✓ Write permissions OK for: ${dir}`);
  } catch (writeErr) {
    console.error(`❌ CANNOT WRITE to output directory: ${dir}`);
    console.error(`Error:`, writeErr.message);
    console.error(`Directory exists: ${fs.existsSync(dir)}`);
    if (fs.existsSync(dir)) {
      const dirStats = fs.statSync(dir);
      console.log(`Directory permissions: ${dirStats.mode.toString(8)}`);
      console.log(`Directory owner UID: ${dirStats.uid}, GID: ${dirStats.gid}`);
    }
    console.error(`Current process UID: ${process.getuid ? process.getuid() : 'N/A'}, GID: ${process.getgid ? process.getgid() : 'N/A'}`);
    return;
  }
  
  // Check FFmpeg executable permissions
  try {
    execSync('which ffmpeg', { stdio: 'pipe' });
    console.log(`✓ FFmpeg is in PATH`);
  } catch (whichErr) {
    console.error(`⚠️ FFmpeg might not be in PATH`);
    console.error(`Trying to run ffmpeg directly...`);
  }
  
  // Spawn FFmpeg with shell enabled on Linux for better process management
  const isLinux = process.platform === 'linux';
  const spawnOptions = {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isLinux  // Use shell on Linux for better signal handling
  };
  
  console.log(`\nSpawn options: ${JSON.stringify(spawnOptions)}`);
  console.log(`Running on Linux: ${isLinux}`);
  console.log(`Current working directory: ${process.cwd()}`);
  console.log(`Process user: ${process.env.USER || process.env.USERNAME || 'unknown'}\n`);
  
  const ffmpeg = spawn("ffmpeg", ffmpegArgs, spawnOptions);
  
  // Store process info
  runningStreams[name] = { 
    process: ffmpeg, 
    failed: false,
    startTime: new Date(),
    pid: ffmpeg.pid,
    outputPlaylist: outputPlaylist,
    outputSegment: outputSegment
  };
  
  console.log(`FFmpeg process spawned for stream ${name} with PID: ${ffmpeg.pid}`);
  console.log(`Waiting for stream files to be created...\n`);
  
  // Monitor output directory for file creation
  const fileCreationTimeouts = [];
  
  // Check for playlist creation at 1s, 2s, 5s intervals
  const checkFileExists = (filePath, description, delayMs) => {
    const timeout = setTimeout(() => {
      const exists = fs.existsSync(filePath);
      console.log(`${description} ${exists ? '✓ CREATED' : '❌ NOT YET CREATED'}: ${filePath}`);
      if (exists && description.includes('Playlist')) {
        hasCreatedPlaylist = true;
        const stats = fs.statSync(filePath);
        console.log(`  Playlist size: ${stats.size} bytes`);
      }
    }, delayMs);
    fileCreationTimeouts.push(timeout);
  };
  
  checkFileExists(outputPlaylist, 'Playlist (1s)', 1000);
  checkFileExists(outputPlaylist, 'Playlist (2s)', 2000);
  checkFileExists(outputPlaylist, 'Playlist (5s)', 5000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (3s)', 3000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (5s)', 5000);
  
  let stdoutData = '';
  let stderrData = '';
  let hasStartedEncoding = false;
  let hasCreatedPlaylist = false;
  
  // Capture stdout for debugging
  ffmpeg.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    stdoutData += msg;
    console.log(`[FFmpeg stdout] ${msg}`);
  });
  
  // Capture stderr for debugging - FFmpeg outputs most info to stderr
  ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString();
    stderrData += msg;
    
    // Log important messages
    if (msg.includes('error') || msg.includes('Error') || msg.includes('Invalid') || msg.includes('Permission denied')) {
      console.error(`[FFmpeg ERROR] ${msg.trim()}`);
    } else if (msg.includes('Output #0') || msg.includes('stream.m3u8') || msg.includes('hls')) {
      console.log(`[FFmpeg] ${msg.trim()}`);
      if (msg.includes('stream.m3u8')) {
        hasCreatedPlaylist = true;
        console.log(`✓ Playlist creation detected!`);
      }
    } else if (msg.includes('frame=') || msg.includes('time=')) {
      // Encoding progress
      if (!hasStartedEncoding) {
        hasStartedEncoding = true;
        console.log(`✓ FFmpeg has started encoding!`);
        
        // List directory contents when encoding starts
        setTimeout(() => {
          try {
            const dirContents = fs.readdirSync(dir);
            console.log(`\n📁 Directory contents during encoding:`);
            dirContents.forEach(file => {
              const filePath = path.join(dir, file);
              const stats = fs.statSync(filePath);
              console.log(`  ${file} (${stats.size} bytes, ${stats.isDirectory() ? 'DIR' : 'FILE'})`);
            });
            console.log('');
          } catch (listErr) {
            console.error(`Error listing directory:`, listErr.message);
          }
        }, 1000);
      }
    }
  });
  
  ffmpeg.on("error", (err) => {
    console.error(`\n❌ FFmpeg process error for stream ${name}:`, err.message);
    if (runningStreams[name]) {
      runningStreams[name].failed = true;
      const streamsMetadata = loadStreamsMetadata();
      const streamIndex = streamsMetadata.findIndex(s => s.name === name);
      if (streamIndex !== -1) {
        streamsMetadata[streamIndex].failed = true;
        saveStreamsMetadata(streamsMetadata);
      }
    }
  });
  
  ffmpeg.on("exit", code => {
    console.log(`\n========== FFMPEG EXIT: ${name} ==========`);
    console.log(`Exit code: ${code}`);
    console.log(`Has created playlist: ${hasCreatedPlaylist}`);
    console.log(`Playlist file exists: ${fs.existsSync(outputPlaylist)}`);
    
    if (runningStreams[name]) {
      if (code !== 0) {
        console.error(`\n❌ FFmpeg exited with code ${code} for stream ${name}`);
        console.error(`Last stderr output:`, stderrData.split('\n').slice(-5).join('\n'));
        runningStreams[name].failed = true;
        const streamsMetadata = loadStreamsMetadata();
        const streamIndex = streamsMetadata.findIndex(s => s.name === name);
        if (streamIndex !== -1) {
          streamsMetadata[streamIndex].failed = true;
          saveStreamsMetadata(streamsMetadata);
        }
      } else {
        console.log(`\n✓ FFmpeg process ended cleanly for stream ${name}`);
      }
      delete runningStreams[name];
    }
    console.log(`=========================================\n`);
  });
  
  console.log(`\n---------- Stream ${name} initialization complete ----------\n`);
}

// Improved stop function with proper process termination and verification
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
    
    const pid = proc.pid;
    console.log(`Killing FFmpeg process ${name} (PID: ${pid})`);
    console.log(`Detected OS: ${process.platform}`);
    
    // Create a promise that resolves when process is confirmed dead
    const killProcess = () => {
      return new Promise((resolve, reject) => {
        let processDead = false;
        
        // Function to check if process is still running
        const isProcessRunning = (pid) => {
          try {
            // Cross-platform method to check if process exists
            process.kill(pid, 0);
            return true;
          } catch (e) {
            return false;
          }
        };
        
        // Determine the best kill method based on OS
        const getKillMethod = () => {
          if (process.platform === 'win32') {
            return 'taskkill';
          } else if (process.platform === 'linux' || process.platform === 'darwin') {
            return 'signal';
          } else {
            // Fallback for other platforms
            return 'generic';
          }
        };
        
        const killMethod = getKillMethod();
        console.log(`Using kill method: ${killMethod} for platform ${process.platform}`);
        
        // Step 1: Try graceful shutdown first with SIGTERM
        try {
          proc.kill('SIGTERM');
          console.log(`Sent SIGTERM to process ${pid}`);
        } catch (sigtermErr) {
          console.error(`Error sending SIGTERM:`, sigtermErr);
        }
        
        // Check every 500ms if process is dead, force kill after 2 seconds
        const checkInterval = setInterval(() => {
          if (!isProcessRunning(pid)) {
            console.log(`Process ${pid} terminated successfully after SIGTERM`);
            clearInterval(checkInterval);
            clearTimeout(forceKillTimeout);
            resolve(true);
          }
        }, 500);
        
        // Force kill timeout after 2 seconds
        const forceKillTimeout = setTimeout(() => {
          clearInterval(checkInterval);
          
          if (isProcessRunning(pid)) {
            console.warn(`Process ${pid} didn't terminate gracefully, using force kill method: ${killMethod}`);
            
            try {
              if (killMethod === 'taskkill') {
                // Windows: Use taskkill to forcefully terminate the process tree
                console.log(`Executing: taskkill /pid ${pid} /T /F`);
                const { execSync } = require('child_process');
                const result = execSync(`taskkill /pid ${pid} /T /F`, { 
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'pipe']
                });
                console.log(`taskkill output: ${result.trim()}`);
                console.log(`Force killed process ${pid} using taskkill (Windows)`);
                
              } else if (killMethod === 'signal') {
                // Linux/Unix/Mac: Use SIGKILL signal
                console.log(`Sending SIGKILL to process ${pid}`);
                proc.kill('SIGKILL');
                console.log(`Force killed process ${pid} using SIGKILL (${process.platform})`);
                
              } else {
                // Generic fallback: Try both methods
                console.log(`Using generic kill method for unknown platform`);
                try {
                  proc.kill('SIGKILL');
                } catch (e) {
                  // If signal fails, try exec method
                  try {
                    const { execSync } = require('child_process');
                    execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
                  } catch (execErr) {
                    console.error(`Generic kill method failed:`, execErr);
                  }
                }
                console.log(`Force killed process ${pid} using generic method`);
              }
              
              // Wait and verify the process is actually dead
              setTimeout(() => {
                if (!isProcessRunning(pid)) {
                  console.log(`Force killed process ${pid} confirmed dead`);
                  resolve(true);
                } else {
                  console.error(`Process ${pid} still running after force kill attempt`);
                  
                  // Last resort: Try alternative method
                  if (killMethod === 'taskkill') {
                    // On Windows, if taskkill failed, try SIGKILL
                    console.log(`Taskkill failed, trying SIGKILL as fallback`);
                    try {
                      proc.kill('SIGKILL');
                      setTimeout(() => {
                        if (!isProcessRunning(pid)) {
                          console.log(`Fallback SIGKILL succeeded for process ${pid}`);
                          resolve(true);
                        } else {
                          reject(new Error(`Process ${pid} refused to die`));
                        }
                      }, 1000);
                    } catch (fallbackErr) {
                      reject(new Error(`All kill methods failed for process ${pid}`));
                    }
                  } else {
                    // On Unix, if SIGKILL failed, try exec method
                    console.log(`SIGKILL failed, trying exec kill as fallback`);
                    try {
                      const { execSync } = require('child_process');
                      if (process.platform === 'win32') {
                        execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
                      } else {
                        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
                      }
                      setTimeout(() => {
                        if (!isProcessRunning(pid)) {
                          console.log(`Fallback exec kill succeeded for process ${pid}`);
                          resolve(true);
                        } else {
                          reject(new Error(`Process ${pid} refused to die`));
                        }
                      }, 1000);
                    } catch (fallbackErr) {
                      reject(new Error(`All kill methods failed for process ${pid}`));
                    }
                  }
                }
              }, 1000);
              
            } catch (forceErr) {
              console.error(`Error force killing process with ${killMethod}:`, forceErr);
              reject(forceErr);
            }
          } else {
            resolve(true);
          }
        }, 2000);
        
        // Timeout after 5 seconds total
        setTimeout(() => {
          clearInterval(checkInterval);
          clearTimeout(forceKillTimeout);
          
          if (isProcessRunning(pid)) {
            console.error(`Process ${pid} still running after 5 seconds, all methods failed`);
            reject(new Error(`Process ${pid} did not terminate after 5 seconds`));
          } else {
            console.log(`Process ${pid} confirmed dead before timeout`);
            resolve(true);
          }
        }, 5000);
      });
    };
    
    // Execute the kill and wait for confirmation
    killProcess()
      .then(() => {
        console.log(`Stream ${name} process ${pid} fully terminated`);
      })
      .catch((err) => {
        console.error(`Error terminating process for ${name}:`, err);
      });
    
    // Clean up immediately from our tracking (don't wait)
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
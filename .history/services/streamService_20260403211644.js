const { exec, execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { logger } = require("../utils/logger");

// In-memory storage for running streams
const runningStreams = {};

/**
 * Get all running streams
 */
function getRunningStreams() {
  return runningStreams;
}

/**
 * List all streams with their status
 */
function listStreams(req) {
  const STREAMS_DB_FILE = path.join(__dirname, "..", "streams.json");
  let streamsMetadata = [];
  
  try {
    if (fs.existsSync(STREAMS_DB_FILE)) {
      streamsMetadata = JSON.parse(fs.readFileSync(STREAMS_DB_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading streams metadata:', err);
  }
  
  return streamsMetadata.map(streamData => {
    const entry = runningStreams[streamData.name];
    let alive = false;
    
    if (entry) {
      if (entry.isNative) {
        try {
          process.kill(entry.pid, 0);
          alive = true;
        } catch (e) {
          alive = false;
        }
      } else {
        alive = entry.process && entry.process.exitCode === null;
      }
    }
    
    return { 
      name: streamData.name, 
      status: alive ? "running" : (streamData.failed ? "failed" : "stopped"),
      url: `${req.protocol}://${req.get("host")}/streams/${streamData.name}/stream.m3u8`,
      createdAt: streamData.createdAt
    };
  });
}

/**
 * Load streams metadata from persistent storage
 */
function loadStreamsMetadata() {
  const STREAMS_DB_FILE = path.join(__dirname, "..", "streams.json");
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

/**
 * Save streams metadata to persistent storage
 */
function saveStreamsMetadata(streamsArray) {
  const STREAMS_DB_FILE = path.join(__dirname, "..", "streams.json");
  try {
    fs.writeFileSync(STREAMS_DB_FILE, JSON.stringify(streamsArray, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving streams metadata:', err);
    return false;
  }
}

/**
 * Start FFmpeg HLS stream using spawn() with detached mode (PRIMARY METHOD)
 * Falls back to native nohup command if spawn fails
 */
function startStream(name, filePath) {
  console.log(`\n========== STARTING STREAM: ${name} ==========`);
  logger.info(`Starting stream: ${name}`);
  
  // First, ensure any existing process is completely stopped
  const existingEntry = runningStreams[name];
  if (existingEntry) {
    stopStreamSync(name);
    delete runningStreams[name];
  }
  
  const dir = path.dirname(filePath);
  
  // Verify input file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Input file does not exist: ${filePath}`);
    return;
  }
  
  // CRITICAL: Use absolute paths for outputs
  const outputPlaylist = path.join(dir, 'stream.m3u8');
  const outputSegment = path.join(dir, 'seg_%03d.ts');
  
  // Check write permissions on output directory
  try {
    const testFile = path.join(dir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (writeErr) {
    console.error(`❌ CANNOT WRITE to output directory`);
    console.error(`Error:`, writeErr.message);
    return;
  }
  
  // CRITICAL: Verify FFmpeg is installed and accessible
  try {
    const versionOutput = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
  } catch (ffmpegErr) {
    console.error(`❌ FFMPEG NOT FOUND OR NOT EXECUTABLE!`);
    console.error(`\nSOLUTION: Install FFmpeg or add it to PATH`);
    console.error(`Ubuntu/Debian: sudo apt install ffmpeg`);
    console.error(`CentOS/RHEL: sudo yum install ffmpeg`);
    console.error(`Windows: Download from ffmpeg.org and add to PATH\n`);
    return;
  }
  
  // ALTERNATIVE APPROACH: Use spawn() with detached mode for better control
  console.log(`\n🚀 Starting FFmpeg process...`);
  
  // Build FFmpeg arguments array with optimizations for large files
  const ffmpegArgs = [
    '-re',                                    // Read input at native frame rate
    '-stream_loop', '-1',                     // Infinite loop
    '-i', filePath,                           // Input file (absolute path)
    '-vn',                                    // Disable video (skip album art/embedded images)
    '-c:a', 'copy',                           // Copy audio (low CPU)
    '-hls_time', '3',                         // 3-second segments
    '-hls_list_size', '6',                    // Keep 6 segments (~18s buffer)
    '-hls_flags', 'delete_segments+round_durations',
    '-hls_segment_filename', outputSegment,
    '-hls_segment_type', 'mpegts',
    '-max_muxing_queue_size', '1024',         // Increase queue size for large files
    '-thread_queue_size', '512',              // Increase thread queue size
    '-bufsize', '64M',                        // Set buffer size
    outputPlaylist                            // Output playlist
  ];
  
  // Create log file stream for capturing FFmpeg output
  const logPath = path.join(dir, 'ffmpeg.log');
  let logStream;
  try {
    logStream = fs.createWriteStream(logPath, { flags: 'w' });
  } catch (logErr) {
    console.error(`⚠ Could not create log file:`, logErr.message);
    logStream = null;
  }
  
  // Spawn FFmpeg as a detached process
  const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
    detached: true,              // Run in background (survives parent exit)
    stdio: ['ignore', 'pipe', 'pipe'],  // stdin, stdout, stderr
    cwd: dir                     // Set working directory to output folder
  });
  
  console.log(`✅ Stream '${name}' started successfully (PID: ${ffmpegProcess.pid})`);
  
  // CRITICAL: Capture FFmpeg stdout and stderr for logging (errors only)
  if (ffmpegProcess.stdout) {
    ffmpegProcess.stdout.on('data', (data) => {
      // Don't log stdout - too verbose, only write to log file
      if (logStream) {
        logStream.write(`[STDOUT] ${new Date().toISOString()}: ${data.toString()}\n`);
      }
    });
  }
  
  if (ffmpegProcess.stderr) {
    ffmpegProcess.stderr.on('data', (data) => {
      const message = data.toString();
      // Only log errors to console, everything goes to log file
      if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fatal')) {
        console.error(`[FFmpeg ERROR] ${message.trim()}`);
        if (logStream) {
          logStream.write(`[ERROR] ${new Date().toISOString()}: ${message}\n`);
        }
      } else {
        // Regular progress information - only to log file
        if (logStream) {
          logStream.write(`[STDERR] ${new Date().toISOString()}: ${message}\n`);
        }
      }
    });
  }
  
  // Handle process exit
  ffmpegProcess.on('exit', (code, signal) => {
    console.log(`\n🛑 FFmpeg process exited with code: ${code}, signal: ${signal}`);
    
    // Stop watchdog
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
      watchdogInterval = null;
    }
    
    if (logStream) {
      logStream.write(`\n=== PROCESS EXITED: code=${code}, signal=${signal} at ${new Date().toISOString()} ===\n`);
      
      // Add diagnostic information
      try {
        const segments = fs.readdirSync(dir).filter(f => f.match(/^seg_\d+\.ts$/));
        logStream.write(`Total segments created: ${segments.length}\n`);
        
        if (fs.existsSync(outputPlaylist)) {
          const playlistContent = fs.readFileSync(outputPlaylist, 'utf8');
          const playlistLines = playlistContent.split('\n').length;
          logStream.write(`Playlist entries: ${playlistLines}\n`);
        }
      } catch (diagErr) {
        logStream.write(`Error gathering diagnostics: ${diagErr.message}\n`);
      }
      
      logStream.end();
    }
    
    // Check if stream still exists in runningStreams (may have been stopped/removed)
    if (runningStreams[name]) {
      if (code !== 0 && signal !== 'SIGTERM') {
        console.error(`❌ FFmpeg exited abnormally! Check logs for details.`);
        console.error(`   Log file: ${logPath}`);
        runningStreams[name].status = 'failed';
      }
    } else {
      console.log(`ℹ️ Stream ${name} not in runningStreams (already stopped/cleaned up)`);
    }
  });
  
  // Handle process errors
  ffmpegProcess.on('error', (err) => {
    console.error(`\n❌ FFmpeg process ERROR:`, err.message);
    console.error(`Error code:`, err.code);
    if (logStream) {
      logStream.write(`\n=== PROCESS ERROR: ${err.message} at ${new Date().toISOString()} ===\n`);
      logStream.end();
    }
    
    // Check if stream still exists in runningStreams
    if (runningStreams[name]) {
      runningStreams[name].status = 'failed';
    }
  });
  
  // Watchdog: Monitor segment creation for large files (silent monitoring)
  const WATCHDOG_TIMEOUT = 30000; // 30 seconds without new segment = problem
  let watchdogInterval = null;
  
  // Function to check if new segments are being created (only log errors)
  const checkSegmentProgress = () => {
    try {
      const segmentPattern = path.join(dir, 'seg_*.ts');
      const segments = fs.readdirSync(dir).filter(f => f.match(/^seg_\d+\.ts$/));
      
      if (segments.length > 0) {
        // Get the latest segment
        const latestSegment = segments.sort().pop();
        const segmentPath = path.join(dir, latestSegment);
        const stats = fs.statSync(segmentPath);
        const timeSinceLastSegment = Date.now() - runningStreams[name].lastSegmentTime;
        
        if (stats.mtimeMs > runningStreams[name].lastSegmentTime) {
          // New segment detected (don't log - too verbose)
          runningStreams[name].lastSegmentTime = stats.mtimeMs;
          runningStreams[name].segmentCount = segments.length;
        } else if (timeSinceLastSegment > WATCHDOG_TIMEOUT) {
          // Only log warnings when there's a problem
          console.error(`⚠️ WARNING: No new segments for ${Math.round(timeSinceLastSegment / 1000)}s`);
          console.error(`   Last segment: ${latestSegment}`);
          console.error(`   Checking FFmpeg process status...`);
          
          // Check if process is still running
          try {
            process.kill(ffmpegProcess.pid, 0);
            console.error(`   FFmpeg process is still alive (PID: ${ffmpegProcess.pid})`);
            console.error(`   This may indicate a stuck encoding process or buffer issue`);
          } catch (e) {
            console.error(`   ❌ FFmpeg process has died!`);
            runningStreams[name].status = 'failed';
            clearInterval(watchdogInterval);
          }
        }
      }
    } catch (watchErr) {
      console.error(`Watchdog error:`, watchErr.message);
    }
  };
  
  // Start watchdog monitoring (check every 15 seconds)
  watchdogInterval = setInterval(checkSegmentProgress, 15000);
  
  // Periodic health check - log status every 30 seconds (high-level only)
  const healthCheckInterval = setInterval(() => {
    try {
      if (!runningStreams[name] || runningStreams[name].status !== 'running') {
        clearInterval(healthCheckInterval);
        return;
      }
      
      // Check process is still alive
      try {
        process.kill(ffmpegProcess.pid, 0);
        
        // Get current segment count
        const segments = fs.readdirSync(dir).filter(f => f.match(/^seg_\d+\.ts$/));
        const uptime = Math.round((Date.now() - runningStreams[name].startTime.getTime()) / 1000);
        
        // Only log health check periodically and at high level
        console.log(`💓 Stream '${name}' healthy - Uptime: ${uptime}s`);
        
        if (logStream) {
          logStream.write(`[HEALTH] Uptime: ${uptime}s, Segments: ${segments.length}, PID: ${ffmpegProcess.pid}\n`);
        }
      } catch (e) {
        console.error(`❌ Health check failed: Process died!`);
        clearInterval(healthCheckInterval);
        if (watchdogInterval) clearInterval(watchdogInterval);
      }
    } catch (healthErr) {
      console.error(`Health check error:`, healthErr.message);
    }
  }, 30000);
  
  // Store process info with interval IDs for cleanup
  runningStreams[name] = { 
    pid: ffmpegProcess.pid,
    process: ffmpegProcess,
    isNative: false,
    startTime: new Date(),
    outputPlaylist: outputPlaylist,
    outputSegment: outputSegment,
    workingDir: dir,
    logFile: logPath,
    status: 'running',
    lastSegmentTime: Date.now(),
    segmentCount: 0,
    watchdogInterval: watchdogInterval,
    healthCheckInterval: healthCheckInterval
  };
  
  // Monitor file creation with minimal logging (only errors)
  console.log(`⏱️ Monitoring file creation...`);
  
  const checkFileExists = (filePath, description, delayMs) => {
    setTimeout(() => {
      const exists = fs.existsSync(filePath);
      // Only log if file wasn't created (error condition)
      if (!exists) {
        console.warn(`⚠️ ${description} - File not created: ${filePath}`);
      }
      // Don't log successful file creation (too verbose)
    }, delayMs);
  };
  
  checkFileExists(outputPlaylist, 'Playlist (2s)', 2000);
  checkFileExists(outputPlaylist, 'Playlist (5s)', 5000);
  checkFileExists(outputPlaylist, 'Playlist (10s)', 10000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (3s)', 3000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (6s)', 6000);
  
  // Show log file contents after 8 seconds (minimal output)
  setTimeout(() => {
    try {
      if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf8');
        
        // Only log if there are errors
        if (logContent.toLowerCase().includes('error') || logContent.toLowerCase().includes('invalid')) {
          console.error(`\n⚠️ ERRORS FOUND IN LOG! Check log file: ${logPath}`);
        }
        // Don't log success message (too verbose)
      }
    } catch (logErr) {
      console.error(`Error reading log:`, logErr.message);
    }
  }, 8000);
}

/**
 * Stop a stream (async version)
 */
function stopStream(name) {
  console.log(`Stopping stream: ${name}`);
  const ent = runningStreams[name];
  
  if (!ent) {
    console.log(`Stream ${name} not found in running processes`);
    return false;
  }
  
  try {
    // Handle spawned FFmpeg processes
    if (ent.process && !ent.process.killed) {
      console.log(`Stopping spawned FFmpeg process ${name} (PID: ${ent.pid})`);
      
      // Clear monitoring intervals
      if (ent.watchdogInterval) {
        clearInterval(ent.watchdogInterval);
        console.log(`✓ Stopped watchdog timer`);
      }
      if (ent.healthCheckInterval) {
        clearInterval(ent.healthCheckInterval);
        console.log(`✓ Stopped health check timer`);
      }
      
      // Send SIGTERM for graceful shutdown
      ent.process.kill('SIGTERM');
      console.log(`Sent SIGTERM to process ${ent.pid}`);
      
      // Force kill after 2 seconds if still running
      setTimeout(() => {
        try {
          if (ent.process && !ent.process.killed) {
            console.log(`Process ${ent.pid} still running, sending SIGKILL`);
            ent.process.kill('SIGKILL');
          }
        } catch (killErr) {
          console.error(`Error force killing process:`, killErr.message);
        }
      }, 2000);
      
      delete runningStreams[name];
      console.log(`Stream ${name} stopped successfully`);
      return true;
    }
    
    // Fallback for native processes (if any)
    if (ent.isNative) {
      console.log(`Stopping native FFmpeg process ${name} (PID: ${ent.pid})`);
      
      try {
        execSync(`kill -TERM ${ent.pid}`, { stdio: 'ignore' });
        console.log(`Sent SIGTERM to native process ${ent.pid}`);
        
        setTimeout(() => {
          try {
            process.kill(ent.pid, 0);
            console.log(`Process ${ent.pid} still running, sending SIGKILL`);
            execSync(`kill -KILL ${ent.pid}`, { stdio: 'ignore' });
          } catch (e) {
            console.log(`Native process ${ent.pid} terminated successfully`);
          }
        }, 1000);
      } catch (killErr) {
        console.error(`Error killing native process:`, killErr.message);
      }
      
      delete runningStreams[name];
      console.log(`Stream ${name} stopped successfully`);
      return true;
    }
    
    console.log(`Process for ${name} already killed or invalid`);
    delete runningStreams[name];
    return false;
    
  } catch (err) {
    console.error(`Error stopping stream ${name}:`, err);
    delete runningStreams[name];
    return false;
  }
}

/**
 * Stop a stream synchronously (for cleanup before starting new one)
 */
function stopStreamSync(name) {
  console.log(`Stopping stream synchronously: ${name}`);
  const ent = runningStreams[name];
  
  if (!ent) {
    console.log(`Stream ${name} not found in running processes`);
    return false;
  }
  
  try {
    // Handle spawned processes
    if (ent.process && !ent.process.killed) {
      console.log(`Stopping spawned FFmpeg process ${name} (PID: ${ent.pid})`);
      
      try {
        ent.process.kill('SIGTERM');
        console.log(`Sent SIGTERM to spawned process ${ent.pid}`);
        
        // Wait up to 2 seconds for graceful shutdown
        let waited = 0;
        while (waited < 2000) {
          if (ent.process.killed || ent.process.exitCode !== null) {
            console.log(`Spawned process ${ent.pid} terminated after ${waited}ms`);
            break;
          }
          require('deasync').sleep(100);
          waited += 100;
        }
        
        // Force kill if still alive
        if (ent.process && !ent.process.killed) {
          console.log(`Process still alive, sending SIGKILL`);
          ent.process.kill('SIGKILL');
        }
      } catch (sigErr) {
        console.error(`Error stopping spawned process:`, sigErr.message);
      }
      
      delete runningStreams[name];
      return true;
    }
    
    // Handle native FFmpeg processes
    if (ent.isNative) {
      console.log(`Stopping native FFmpeg process ${name} (PID: ${ent.pid})`);
      
      try {
        execSync(`kill -TERM ${ent.pid}`, { stdio: 'ignore', timeout: 2000 });
        console.log(`Sent SIGTERM to native process ${ent.pid}`);
        
        // Wait up to 2 seconds for graceful shutdown
        let waited = 0;
        while (waited < 2000) {
          try {
            process.kill(ent.pid, 0);
            // Still running
            require('deasync').sleep(100);
            waited += 100;
          } catch (e) {
            // Process dead
            console.log(`Native process ${ent.pid} terminated after ${waited}ms`);
            break;
          }
        }
        
        // Force kill if still alive
        try {
          process.kill(ent.pid, 0);
          console.log(`Process still alive, sending SIGKILL`);
          execSync(`kill -KILL ${ent.pid}`, { stdio: 'ignore' });
        } catch (e) {
          console.log(`Process terminated successfully`);
        }
      } catch (killErr) {
        console.error(`Error killing native process:`, killErr.message);
      }
      
      delete runningStreams[name];
      return true;
    }
    
    delete runningStreams[name];
    return true;
  } catch (err) {
    console.error(`Error stopping stream ${name}:`, err);
    delete runningStreams[name];
    return false;
  }
}

/**
 * Delete a stream (stop and remove files)
 */
async function deleteStream(name) {
  return new Promise((resolve, reject) => {
    console.log(`Delete request received for stream: ${name}`);
    
    // Always stop the stream first to kill FFmpeg process
    stopStream(name);
    
    // Wait a moment to ensure process is killed before deleting files
    setTimeout(() => {
      try {
        const folder = path.join(__dirname, "..", "streams", name);
        console.log(`Deleting folder: ${folder}`);
        fs.rmSync(folder, { recursive: true, force: true });
        
        // Remove from metadata
        const streamsMetadata = loadStreamsMetadata();
        const filteredMetadata = streamsMetadata.filter(s => s.name !== name);
        saveStreamsMetadata(filteredMetadata);
        
        console.log(`Stream ${name} deleted successfully`);
        resolve();
      } catch (err) {
        console.error(`Error deleting stream ${name}:`, err);
        reject(err);
      }
    }, 1000); // Wait 1 second to ensure process is fully terminated
  });
}

/**
 * Restore streams after application restart
 */
function restoreStreams() {
  const streamsMetadata = loadStreamsMetadata();
  
  // First, check for any existing streams in the streams folder (legacy support)
  const base = path.join(__dirname, "..", "streams");
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

/**
 * Start universal audio HLS stream from any platform supported by yt-dlp/youtube-dl
 * Supports: YouTube, Instagram, SoundCloud, TikTok, Twitter/X, Facebook, and more
 * @param {string} name - Stream name
 * @param {string} mediaUrl - Media URL from any supported platform
 * @param {string} [cookiesPath] - Optional path to cookies.txt file for authentication
 */
async function startYoutubeStream(name, mediaUrl, cookiesPath) {
  console.log(`\n========== STARTING UNIVERSAL STREAM: ${name} ==========`);
  console.log(`Processing audio stream request`);
  
  // Create stream directory
  const streamDir = path.join(__dirname, '..', 'streams', name);
  try {
    if (!fs.existsSync(streamDir)) {
      fs.mkdirSync(streamDir, { recursive: true });
    }
    console.log(`✓ Stream directory created: ${streamDir}`);
  } catch (err) {
    console.error(`❌ Error creating stream directory:`, err.message);
    return { success: false, error: 'Failed to create stream directory' };
  }
  
  // Check for youtube-dl or yt-dlp (yt-dlp is recommended successor)
  console.log(`\n🔍 Checking for yt-dlp/youtube-dl...`);
  let downloader = null;
  
  try {
    execSync('which yt-dlp', { encoding: 'utf8' }).trim();
    downloader = 'yt-dlp';
    console.log(`✓ yt-dlp found (recommended)`);
  } catch (e1) {
    try {
      execSync('which youtube-dl', { encoding: 'utf8' }).trim();
      downloader = 'youtube-dl';
      console.log(`✓ youtube-dl found`);
    } catch (e2) {
      console.error(`❌ Neither yt-dlp nor youtube-dl found!`);
      console.error(`\nSOLUTION: Install one of them:`);
      console.error(`  pip install yt-dlp  (recommended - supports more platforms)`);
      console.error(`  pip install youtube-dl`);
      console.error(`  sudo apt install yt-dlp  (Debian/Ubuntu)`);
      console.error(`\nSupported platforms: YouTube, Instagram, SoundCloud, TikTok, Twitter/X, Facebook, and 1000+ more`);
      return { success: false, error: 'Universal downloader not installed' };
    }
  }
  
  // Auto-detect cookies from secure cookies directory
  const cookiesDir = path.join(__dirname, '..', 'cookies');
  let autoDetectedCookiesPath = null;
  
  if (fs.existsSync(cookiesDir)) {
    try {
      const files = fs.readdirSync(cookiesDir);
      const txtFiles = files.filter(f => f.endsWith('.txt'));
      
      if (txtFiles.length > 0) {
        // Prioritize specific cookie files based on platform
        const urlLower = mediaUrl.toLowerCase();
        
        // Try to find platform-specific cookies first
        if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
          const ytCookies = txtFiles.find(f => 
            f.toLowerCase().includes('youtube') || f === 'cookies.txt'
          );
          if (ytCookies) {
            autoDetectedCookiesPath = path.join(cookiesDir, ytCookies);
            console.log(`🍪 Auto-detected YouTube cookies: ${ytCookies}`);
          }
        } else if (urlLower.includes('instagram.com')) {
          const igCookies = txtFiles.find(f => 
            f.toLowerCase().includes('instagram') || f === 'cookies.txt'
          );
          if (igCookies) {
            autoDetectedCookiesPath = path.join(cookiesDir, igCookies);
            console.log(`🍪 Auto-detected Instagram cookies: ${igCookies}`);
          }
        } else {
          // Use any available cookies file as fallback
          autoDetectedCookiesPath = path.join(cookiesDir, txtFiles[0]);
          console.log(`🍪 Using default cookies: ${txtFiles[0]}`);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Error scanning cookies directory:`, err.message);
    }
  }
  
  // If auto-detected cookies exist, use them; otherwise check parameter
  const finalCookiesPath = autoDetectedCookiesPath || (cookiesPath && fs.existsSync(cookiesPath) ? cookiesPath : null);
  
  // Validate cookies file if provided or auto-detected
  let cookiesValidated = false;
  if (finalCookiesPath) {
    if (!fs.existsSync(finalCookiesPath)) {
      console.error(`⚠️ Cookies file not found: ${finalCookiesPath}`);
      console.error(`Continuing without authentication...`);
    } else {
      try {
        // Basic validation - check if it's readable and has content
        fs.accessSync(finalCookiesPath, fs.constants.R_OK);
        const stats = fs.statSync(finalCookiesPath);
        
        if (stats.size === 0) {
          console.warn(`⚠️ Cookies file is empty: ${finalCookiesPath}`);
        } else {
          console.log(`✓ Cookies file validated (${(stats.size / 1024).toFixed(2)} KB)`);
          cookiesValidated = true;
        }
      } catch (cookieErr) {
        console.error(`⚠️ Error reading cookies file: ${cookieErr.message}`);
      }
    }
  } else {
    console.log(`ℹ️ No cookies file found - some platforms may require authentication`);
  }
  
  // Detect platform from URL for better user feedback
  let detectedPlatform = 'Unknown';
  try {
    const urlObj = new URL(mediaUrl);
    const hostname = urlObj.hostname.toLowerCase();
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      detectedPlatform = 'YouTube';
    } else if (hostname.includes('instagram.com')) {
      detectedPlatform = 'Instagram';
    } else if (hostname.includes('soundcloud.com')) {
      detectedPlatform = 'SoundCloud';
    } else if (hostname.includes('tiktok.com')) {
      detectedPlatform = 'TikTok';
    } else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      detectedPlatform = 'Twitter/X';
    } else if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) {
      detectedPlatform = 'Facebook';
    } else if (hostname.includes('vimeo.com')) {
      detectedPlatform = 'Vimeo';
    } else if (hostname.includes('twitch.tv')) {
      detectedPlatform = 'Twitch';
    }
  } catch (e) {
    // Invalid URL, will be caught by downloader
  }
  
  console.log(`\n🎯 Detected platform: ${detectedPlatform}`);
  console.log(`📥 Downloading audio from ${detectedPlatform}...`);
  console.log(`Output will be saved to stream directory\n`);
  
  // Output template for downloaded audio
  const audioOutput = path.join(streamDir, 'audio.mp3');
  
  // Build download command with optional cookies support
  const downloadCommandParts = [
    `${downloader}`,
    '--extract-audio',
    '--audio-format mp3',
    '--audio-quality 192K',
    '-o', `"${audioOutput}"`,
    '--no-playlist',  // Only download single video, not playlist
    '--no-check-certificates',
    '--no-warnings'
  ];
  
  // Add cookies parameter if provided
  if (finalCookiesPath) {
    downloadCommandParts.push('--cookies', `"${path.basename(finalCookiesPath)}"`);
    console.log(`🍪 Using cookies authentication`);
  }
  
  downloadCommandParts.push(`"${mediaUrl}"`);
  
  const downloadCommand = downloadCommandParts.join(' ');
  
  console.log(`Download command: ${downloadCommand}\n`);
  
  return new Promise((resolve, reject) => {
    exec(downloadCommand, { cwd: streamDir, timeout: 300000 }, async (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Download failed:`, error.message);
        console.error(`stderr:`, stderr);
        
        // Provide helpful error messages based on common issues
        let errorMsg = stderr || error.message;
        let requiresCookies = false;
        
        // Detect cookie-related errors
        const cookieErrorPatterns = [
          'Sign in to confirm your age',
          'Please sign in',
          'This video is private',
          'Private video',
          'Video is unavailable',
          'members-only',
          'Join this channel',
          'Subscribe to join'
        ];
        
        // Check if error is related to missing authentication
        if (cookieErrorPatterns.some(pattern => stderr.includes(pattern))) {
          requiresCookies = true;
          
          if (!finalCookiesPath || !cookiesValidated) {
            errorMsg = `Authentication required. This ${detectedPlatform} content requires cookies. Please place a cookies.txt file in the /cookies directory.`;
          } else {
            errorMsg = `Authentication failed. Your cookies may be expired or insufficient for this content. Please update your cookies.txt file.`;
          }
        } else if (stderr.includes('Unsupported URL')) {
          errorMsg = `This URL is not supported by ${downloader}. Make sure the URL is correct and points to a valid media page.`;
        } else if (stderr.includes('Video unavailable')) {
          errorMsg = 'The requested video is unavailable or has been removed.';
        } else if (stderr.includes('Copyright') || stderr.includes('blocked')) {
          errorMsg = 'Content is blocked due to copyright or regional restrictions.';
        } else if (stderr.includes('rate limit') || stderr.includes('Too Many Requests')) {
          errorMsg = 'Rate limited by the platform. Please try again later.';
        }
        
        return resolve({ 
          success: false, 
          error: `Download failed: ${errorMsg}`,
          requiresCookies: requiresCookies,
          cookiesProvided: cookiesValidated
        });
      }
      
      console.log(`✅ Audio downloaded successfully!`);
      
      // Verify the audio file was created
      if (!fs.existsSync(audioOutput)) {
        console.error(`❌ Audio file not created after download!`);
        return resolve({ success: false, error: 'Audio file not created' });
      }
      
      const stats = fs.statSync(audioOutput);
      console.log(`✓ Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
      // Save metadata for persistence (hide full path)
      const streamsMetadata = loadStreamsMetadata();
      const existingIndex = streamsMetadata.findIndex(s => s.name === name);
      const metadata = {
        name: name,
        filePath: '[protected]',
        source: detectedPlatform.toLowerCase(),
        createdAt: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        streamsMetadata[existingIndex] = metadata;
      } else {
        streamsMetadata.push(metadata);
      }
      saveStreamsMetadata(streamsMetadata);
      
      console.log(`\n💿 Metadata saved to streams.json`);
      
      // Start FFmpeg stream with the downloaded audio
      console.log(`\n🚀 Starting FFmpeg HLS stream...`);
      startStream(name, audioOutput);
      
      console.log(`\n🎉 Universal audio stream started successfully!`);
      console.log(`Platform: ${detectedPlatform}`);
      console.log(`Stream will be available at: /streams/${name}/stream.m3u8\n`);
      
      resolve({ 
        success: true, 
        audioFile: audioOutput, 
        platform: detectedPlatform,
        cookiesUsed: cookiesValidated
      });
    });
  });
}

module.exports = {
  getRunningStreams,
  listStreams,
  startStream,
  startYoutubeStream,
  stopStream,
  stopStreamSync,
  deleteStream,
  restoreStreams,
  loadStreamsMetadata,
  saveStreamsMetadata
};

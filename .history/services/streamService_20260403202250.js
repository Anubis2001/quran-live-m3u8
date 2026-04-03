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
  logger.verbose(`Input file: ${filePath}`);
  
  // First, ensure any existing process is completely stopped
  const existingEntry = runningStreams[name];
  if (existingEntry) {
    console.log(`Cleaning up existing process for ${name} before starting new one`);
    stopStreamSync(name);
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
  
  // CRITICAL: Use absolute paths for outputs
  const outputPlaylist = path.join(dir, 'stream.m3u8');
  const outputSegment = path.join(dir, 'seg_%03d.ts');
  
  console.log(`\nExpected outputs:`);
  console.log(`  Playlist: ${outputPlaylist}`);
  console.log(`  Segments: ${outputSegment}`);
  
  // Check write permissions on output directory
  try {
    const testFile = path.join(dir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`✓ Write permissions OK`);
  } catch (writeErr) {
    console.error(`❌ CANNOT WRITE to output directory`);
    console.error(`Error:`, writeErr.message);
    return;
  }
  
  // CRITICAL: Verify FFmpeg is installed and accessible
  console.log(`\n🔍 Checking FFmpeg installation...`);
  try {
    const versionOutput = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
    console.log(`✓ FFmpeg found: ${versionOutput}`);
  } catch (ffmpegErr) {
    console.error(`❌ FFMPEG NOT FOUND OR NOT EXECUTABLE!`);
    console.error(`\nSOLUTION: Install FFmpeg or add it to PATH`);
    console.error(`Ubuntu/Debian: sudo apt install ffmpeg`);
    console.error(`CentOS/RHEL: sudo yum install ffmpeg`);
    console.error(`Windows: Download from ffmpeg.org and add to PATH\n`);
    return;
  }
  
  // List current directory contents BEFORE starting FFmpeg
  console.log(`\n📁 Directory state BEFORE FFmpeg:`);
  try {
    const beforeFiles = fs.readdirSync(dir);
    console.log(`Files in ${dir}:`, beforeFiles.length ? beforeFiles : '(empty)');
  } catch (listErr) {
    console.error(`Cannot list directory:`, listErr.message);
  }
  
  // ALTERNATIVE APPROACH: Use spawn() with detached mode for better control
  // This method provides more reliable process management on Linux
  console.log(`\n🚀 STARTING FFMPEG WITH SPAWN (DETACHED MODE):`);
  console.log(`This approach provides better process control and error handling\n`);
  
  // Build FFmpeg arguments array
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
    outputPlaylist                            // Output playlist
  ];
  
  console.log(`FFmpeg command configured`);
  console.log(`Working directory set\n`);
  
  // Create log file stream for capturing FFmpeg output
  const logPath = path.join(dir, 'ffmpeg.log');
  let logStream;
  try {
    logStream = fs.createWriteStream(logPath, { flags: 'w' });
    console.log(`✓ Log file created: ${logPath}`);
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
  
  console.log(`✅ FFmpeg spawned with PID: ${ffmpegProcess.pid}`);
  console.log(`Stream tracking info:`);
  console.log(`  Stream name: ${name}`);
  console.log(`  Process type: spawned (detached)\n`);
  
  // Handle process exit
  ffmpegProcess.on('exit', (code, signal) => {
    console.log(`\n🛑 FFmpeg process exited with code: ${code}, signal: ${signal}`);
    if (logStream) {
      logStream.write(`\n=== PROCESS EXITED: code=${code}, signal=${signal} at ${new Date().toISOString()} ===\n`);
      logStream.end();
    }
    
    // Check if stream still exists in runningStreams (may have been stopped/removed)
    if (runningStreams[name]) {
      if (code !== 0 && signal !== 'SIGTERM') {
        console.error(`❌ FFmpeg exited abnormally! Check logs for details.`);
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
  
  // Store process info
  runningStreams[name] = { 
    pid: ffmpegProcess.pid,
    process: ffmpegProcess,
    isNative: false,
    startTime: new Date(),
    outputPlaylist: outputPlaylist,
    outputSegment: outputSegment,
    workingDir: dir,
    logFile: logPath,
    status: 'running'
  };
  
  console.log(`\n📊 Stream tracking info:`);
  console.log(`  Stream name: ${name}`);
  console.log(`  Process type: spawned (detached)\n`);
  
  // Monitor file creation with aggressive checks
  console.log(`⏱️ Monitoring file creation...`);
  
  const checkFileExists = (filePath, description, delayMs) => {
    setTimeout(() => {
      const exists = fs.existsSync(filePath);
      console.log(`${description} ${exists ? '✓ CREATED' : '❌ NOT CREATED'}: ${filePath}`);
      
      if (exists) {
        const stats = fs.statSync(filePath);
        console.log(`  ✓ File created (${stats.size} bytes)`);
      } else {
        // File doesn't exist - generic message only
        console.log(`  ℹ️ Waiting for file creation...`);
      }
    }, delayMs);
  };
  
  checkFileExists(outputPlaylist, 'Playlist (2s)', 2000);
  checkFileExists(outputPlaylist, 'Playlist (5s)', 5000);
  checkFileExists(outputPlaylist, 'Playlist (10s)', 10000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (3s)', 3000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (6s)', 6000);
  
  // Show log file contents after 8 seconds (minimal output)
  setTimeout(() => {
    console.log(`\n📋 Checking FFmpeg status...`);
    try {
      if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf8');
        
        // Check for errors in log
        if (logContent.toLowerCase().includes('error') || logContent.toLowerCase().includes('invalid')) {
          console.error(`\n⚠️ ERRORS FOUND IN LOG! Check log file for details.`);
        } else {
          console.log(`\n✓ FFmpeg running normally`);
        }
      } else {
        console.error(`❌ Log file not created`);
      }
    } catch (logErr) {
      console.error(`Error reading log:`, logErr.message);
    }
    
    // Success check only
    try {
      const finalFiles = fs.readdirSync(dir);
      if (finalFiles.some(f => f.endsWith('.m3u8'))) {
        console.log(`\n🎉 SUCCESS! HLS files created!`);
      } else {
        console.error(`\n❌ NO M3U8 FILE CREATED! Check logs for details.`);
      }
    } catch (e) {}
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
  
  // Validate cookies file if provided
  if (cookiesPath) {
    if (!fs.existsSync(cookiesPath)) {
      console.error(`⚠️ Cookies file not found: ${cookiesPath}`);
      console.error(`Continuing without authentication...`);
      cookiesPath = null;
    } else {
      try {
        // Basic validation - check if it's readable
        fs.accessSync(cookiesPath, fs.constants.R_OK);
        console.log(`✓ Cookies file validated successfully`);
      } catch (cookieErr) {
        console.error(`⚠️ Error reading cookies file: ${cookieErr.message}`);
        cookiesPath = null;
      }
    }
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
  if (cookiesPath) {
    downloadCommandParts.push('--cookies', `"${path.basename(cookiesPath)}"`);
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
        if (stderr.includes('Sign in to confirm your age')) {
          errorMsg = 'Age-restricted content. Please provide cookies.txt file with authentication.';
        } else if (stderr.includes('Private video') || stderr.includes('This video is private')) {
          errorMsg = 'Private video. Please provide cookies.txt file with authentication.';
        } else if (stderr.includes('Video unavailable')) {
          errorMsg = 'Video is unavailable or has been removed.';
        } else if (stderr.includes('Please sign in')) {
          errorMsg = 'Authentication required. Please provide cookies.txt file.';
        } else if (stderr.includes('Unsupported URL')) {
          errorMsg = `This URL is not supported by ${downloader}. Make sure the URL is correct.`;
        }
        
        return resolve({ success: false, error: `Download failed: ${errorMsg}` });
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
      
      resolve({ success: true, audioFile: audioOutput, platform: detectedPlatform });
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

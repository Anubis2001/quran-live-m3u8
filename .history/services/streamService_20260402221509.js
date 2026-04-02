const { exec, execSync } = require("child_process");
const { exec, execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

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
  console.log(`Input file: ${filePath}`);
  
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
  
  // CRITICAL: Verify FFmpeg is installed and accessible
  console.log(`\n🔍 Checking FFmpeg installation...`);
  try {
    const ffmpegCheck = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    console.log(`✓ FFmpeg found at: ${ffmpegCheck}`);
    
    const versionOutput = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
    console.log(`✓ FFmpeg version: ${versionOutput}`);
  } catch (ffmpegErr) {
    console.error(`❌ FFMPEG NOT FOUND OR NOT EXECUTABLE!`);
    console.error(`Error:`, ffmpegErr.message);
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
  
  console.log(`FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);
  console.log(`Working directory: ${dir}\n`);
  
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
  
  // Capture and log FFmpeg stdout
  if (ffmpegProcess.stdout) {
    ffmpegProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`FFmpeg STDOUT: ${output.trim()}`);
      if (logStream) logStream.write(output);
    });
  }
  
  // Capture and log FFmpeg stderr (most important - contains progress and errors)
  if (ffmpegProcess.stderr) {
    let stderrBuffer = '';
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderrBuffer += output;
      
      // Log stderr lines as they arrive
      const lines = output.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`FFmpeg STDERR: ${line}`);
          if (logStream) logStream.write(`STDERR: ${line}\n`);
        }
      });
      
      // Check for critical errors in real-time
      if (output.toLowerCase().includes('error') || output.toLowerCase().includes('invalid')) {
        console.error(`⚠️ Potential FFmpeg error detected!`);
        if (logStream) logStream.write(`\n⚠️ ERROR DETECTED AT: ${new Date().toISOString()}\n`);
      }
      
      // Detect successful HLS initialization
      if (output.includes('Opening') && output.includes('.m3u8')) {
        console.log(`✓ HLS playlist initialization detected!`);
      }
      
      // Detect segment creation
      if (output.includes('Opening') && output.includes('.ts')) {
        const match = output.match(/Opening '(.*?\.ts)'/);
        if (match) {
          console.log(`✓ Segment creation detected: ${match[1]}`);
        }
      }
    });
  }
  
  // Handle process exit
  ffmpegProcess.on('exit', (code, signal) => {
    console.log(`\n🛑 FFmpeg process exited with code: ${code}, signal: ${signal}`);
    if (logStream) {
      logStream.write(`\n=== PROCESS EXITED: code=${code}, signal=${signal} at ${new Date().toISOString()} ===\n`);
      logStream.end();
    }
    
    if (code !== 0 && signal !== 'SIGTERM') {
      console.error(`❌ FFmpeg exited abnormally! Check logs for details.`);
      runningStreams[name].status = 'failed';
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
    
    runningStreams[name].status = 'failed';
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
  console.log(`  PID: ${ffmpegProcess.pid}`);
  console.log(`  Working directory: ${dir}`);
  console.log(`  Log file: ${logPath}`);
  console.log(`  Expected playlist: ${outputPlaylist}`);
  console.log(`  Process type: spawned (detached)\n`);
  
  // Monitor file creation with aggressive checks
  console.log(`⏱️ Monitoring file creation...`);
  
  const checkFileExists = (filePath, description, delayMs) => {
    setTimeout(() => {
      const exists = fs.existsSync(filePath);
      console.log(`${description} ${exists ? '✓ CREATED' : '❌ NOT CREATED'}: ${filePath}`);
      
      if (exists) {
        const stats = fs.statSync(filePath);
        console.log(`  Size: ${stats.size} bytes | Modified: ${stats.mtime}`);
        
        if (description.includes('Playlist')) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            console.log(`  ✓ Valid M3U8 content (${content.length} chars)`);
            console.log(`  Preview: ${content.substring(0, 200).replace(/\n/g, '\n    ')}`);
          } catch (readErr) {
            console.error(`  Could not read:`, readErr.message);
          }
        }
      } else {
        // File doesn't exist - show what DOES exist
        console.log(`  ℹ️ Files in directory:`);
        try {
          const files = fs.readdirSync(dir);
          files.forEach(f => {
            const fp = path.join(dir, f);
            const stats = fs.statSync(fp);
            console.log(`    ${f} (${stats.size} bytes, ${stats.isDirectory() ? 'DIR' : 'FILE'})`);
          });
        } catch (e) {}
      }
    }, delayMs);
  };
  
  checkFileExists(outputPlaylist, 'Playlist (2s)', 2000);
  checkFileExists(outputPlaylist, 'Playlist (5s)', 5000);
  checkFileExists(outputPlaylist, 'Playlist (10s)', 10000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (3s)', 3000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (6s)', 6000);
  
  // Show log file contents after 8 seconds
  setTimeout(() => {
    console.log(`\n📋 Reading FFmpeg log file...`);
    try {
      if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf8');
        console.log(`Log file exists (${logContent.length} chars):`);
        console.log(logContent.split('\n').map(l => `  ${l}`).join('\n'));
        
        // Check for errors in log
        if (logContent.toLowerCase().includes('error') || logContent.toLowerCase().includes('invalid')) {
          console.error(`\n⚠️ ERRORS FOUND IN LOG!`);
        } else {
          console.log(`\n✓ No obvious errors in log`);
        }
      } else {
        console.error(`❌ Log file not created: ${logPath}`);
      }
    } catch (logErr) {
      console.error(`Error reading log:`, logErr.message);
    }
    
    // Final directory listing
    console.log(`\n📁 Final directory state:`);
    try {
      const finalFiles = fs.readdirSync(dir);
      console.log(`Files in ${dir}:`, finalFiles.length);
      finalFiles.forEach(f => {
        const fp = path.join(dir, f);
        const stats = fs.statSync(fp);
        console.log(`  ${f}: ${stats.size} bytes`);
      });
      
      // Success check
      if (finalFiles.some(f => f.endsWith('.m3u8'))) {
        console.log(`\n🎉 SUCCESS! HLS files created!`);
      } else {
        console.error(`\n❌ STILL NO M3U8 FILE! Check logs above.`);
        console.log(`\n⚠️ FALLBACK: Switching to native nohup command as backup...\n`);
        
        // FALLBACK: Try the native nohup approach if spawn didn't work
        const ffmpegNativeCommand = [
          'cd', `"${dir}"`, '&&',
          'nohup', 'ffmpeg',
          '-re',
          '-stream_loop', '-1',
          '-i', `"${filePath}"`,
          '-vn',
          '-c:a', 'copy',
          '-hls_time', '3',
          '-hls_list_size', '6',
          '-hls_flags', 'delete_segments+round_durations',
          '-hls_segment_filename', `"${outputSegment}"`,
          '-hls_segment_type', 'mpegts',
          `"${outputPlaylist}"`,
          '> "${dir}/ffmpeg_native_fallback.log"', '2>&1', '&', 'echo', '$!'
        ].join(' ');
        
        console.log(`Executing fallback command: ${ffmpegNativeCommand}\n`);
        
        exec(ffmpegNativeCommand, (fallbackError, fallbackStdout, fallbackStderr) => {
          if (fallbackError) {
            console.error(`❌ Fallback command failed:`, fallbackError.message);
            return;
          }
          
          const fallbackPid = parseInt(fallbackStdout.trim());
          console.log(`✅ Fallback FFmpeg started with PID: ${fallbackPid}`);
          
          // Update running streams with fallback process
          runningStreams[name] = { 
            pid: fallbackPid,
            isNative: true,
            startTime: new Date(),
            outputPlaylist: outputPlaylist,
            outputSegment: outputSegment,
            workingDir: dir,
            logFile: path.join(dir, 'ffmpeg_native_fallback.log'),
            status: 'running_fallback'
          };
          
          // Monitor fallback file creation
          setTimeout(() => {
            console.log(`\n📋 Checking fallback results...`);
            try {
              const files = fs.readdirSync(dir);
              console.log(`Files in ${dir}:`, files.length);
              files.forEach(f => {
                const fp = path.join(dir, f);
                const stats = fs.statSync(fp);
                console.log(`  ${f}: ${stats.size} bytes`);
              });
              
              if (files.some(f => f.endsWith('.m3u8'))) {
                console.log(`\n🎉 SUCCESS with fallback method!`);
              } else {
                console.error(`\n❌ FALLBACK ALSO FAILED! Manual intervention required.`);
              }
            } catch (e) {}
          }, 5000);
        });
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
 * Start YouTube audio HLS stream
 * Downloads audio from YouTube and streams it as HLS with infinite loop
 */
async function startYoutubeStream(name, youtubeUrl) {
  console.log(`\n========== STARTING YOUTUBE STREAM: ${name} ==========`);
  console.log(`YouTube URL: ${youtubeUrl}`);
  
  const { exec } = require('child_process');
  
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
  
  // Check for youtube-dl or yt-dlp
  console.log(`\n🔍 Checking for youtube-dl/yt-dlp...`);
  let downloader = null;
  
  try {
    execSync('which yt-dlp', { encoding: 'utf8' }).trim();
    downloader = 'yt-dlp';
    console.log(`✓ yt-dlp found`);
  } catch (e1) {
    try {
      execSync('which youtube-dl', { encoding: 'utf8' }).trim();
      downloader = 'youtube-dl';
      console.log(`✓ youtube-dl found`);
    } catch (e2) {
      console.error(`❌ Neither yt-dlp nor youtube-dl found!`);
      console.error(`\nSOLUTION: Install one of them:`);
      console.error(`  pip install yt-dlp  (recommended)`);
      console.error(`  pip install youtube-dl`);
      console.error(`  sudo apt install yt-dlp  (Debian/Ubuntu)`);
      return { success: false, error: 'YouTube downloader not installed' };
    }
  }
  
  // Output template for downloaded audio
  const audioOutput = path.join(streamDir, 'audio.mp3');
  
  console.log(`\n📥 Downloading audio from YouTube...`);
  console.log(`Output file: ${audioOutput}\n`);
  
  // Download audio using youtube-dl/yt-dlp
  const downloadCommand = [
    `${downloader}`,
    '--extract-audio',
    '--audio-format mp3',
    '--audio-quality 192K',
    '-o', `"${audioOutput}"`,
    '--no-playlist',  // Only download single video, not playlist
    '--no-check-certificates',
    `"${youtubeUrl}"`
  ].join(' ');
  
  console.log(`Download command: ${downloadCommand}\n`);
  
  return new Promise((resolve, reject) => {
    exec(downloadCommand, { cwd: streamDir }, async (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Download failed:`, error.message);
        console.error(`stderr:`, stderr);
        return resolve({ success: false, error: `Download failed: ${stderr}` });
      }
      
      console.log(`✅ Audio downloaded successfully!`);
      console.log(`stdout:`, stdout);
      
      // Verify the audio file was created
      if (!fs.existsSync(audioOutput)) {
        console.error(`❌ Audio file not created after download!`);
        return resolve({ success: false, error: 'Audio file not created' });
      }
      
      const stats = fs.statSync(audioOutput);
      console.log(`✓ Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
      // Save metadata for persistence
      const streamsMetadata = loadStreamsMetadata();
      const existingIndex = streamsMetadata.findIndex(s => s.name === name);
      const metadata = {
        name: name,
        filePath: audioOutput,
        source: 'youtube',
        url: youtubeUrl,
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
      
      console.log(`\n🎉 YouTube audio stream started successfully!`);
      console.log(`Stream URL: http://[server-ip]:8300/streams/${name}/stream.m3u8\n`);
      
      resolve({ success: true, audioFile: audioOutput });
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

const { exec, execSync } = require("child_process");
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
 * Start FFmpeg HLS stream using native system command
 */
function startStream(name, filePath) {
  console.log(`\n========== STARTING STREAM: ${name} ==========`);
  console.log(`Input file: ${filePath}`);
  
  // First, ensure any existing process is completely stopped
  const existingEntry = runningStreams[name];
  if (existingEntry) {
    console.log(`Cleaning up existing process for ${name} before starting new one`);
    stopStreamSync(name); // Use synchronous stop to ensure clean state
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
  
  // CRITICAL: Use absolute paths for outputs (native command requires this)
  const outputPlaylist = path.join(dir, 'stream.m3u8');
  const outputSegment = path.join(dir, 'seg_%03d.ts');
  
  // Build FFmpeg command for NATIVE execution on Linux
  // Using nohup + & for true background execution
  const ffmpegCommand = `
    cd "${dir}" && \\
    nohup ffmpeg \\
      -re \\
      -stream_loop -1 \\
      -i "${filePath}" \\
      -c:a copy \\
      -hls_time 4 \\
      -hls_list_size 5 \\
      -hls_flags delete_segments \\
      -hls_segment_filename "${outputSegment}" \\
      "${outputPlaylist}" \\
      > "${dir}/ffmpeg_stdout.log" 2>&1 & echo $!
  `.trim().replace(/\n\s+/g, ' ');
  
  console.log(`\n🚀 EXECUTING NATIVE FFMPEG COMMAND:`);
  console.log(ffmpegCommand);
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
  
  console.log(`\n⚙️ Executing native FFmpeg command on Linux...`);
  
  // Execute the native command
  exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Error executing FFmpeg command:`, error.message);
      console.error(`stderr:`, stderr);
      return;
    }
    
    const pid = parseInt(stdout.trim());
    console.log(`✅ FFmpeg started as background process with PID: ${pid}`);
    
    // Store process info
    runningStreams[name] = { 
      pid: pid,
      isNative: true,           // Flag to indicate this is a native process
      startTime: new Date(),
      outputPlaylist: outputPlaylist,
      outputSegment: outputSegment,
      workingDir: dir,
      logFile: path.join(dir, 'ffmpeg_stdout.log')
    };
    
    console.log(`\n📊 Stream tracking info:`);
    console.log(`  Stream name: ${name}`);
    console.log(`  PID: ${pid}`);
    console.log(`  Output directory: ${dir}`);
    console.log(`  Log file: ${runningStreams[name].logFile}`);
    
    // Monitor file creation
    console.log(`\n⏱️ Monitoring file creation...`);
    
    const checkFileExists = (filePath, description, delayMs) => {
      setTimeout(() => {
        const exists = fs.existsSync(filePath);
        console.log(`${description} ${exists ? '✓ CREATED' : '❌ NOT YET CREATED'}: ${filePath}`);
        if (exists) {
          const stats = fs.statSync(filePath);
          console.log(`  Size: ${stats.size} bytes | Modified: ${stats.mtime}`);
          
          if (description.includes('Playlist')) {
            // Read and log playlist contents for debugging
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              console.log(`  Playlist preview (first 200 chars):`);
              console.log(`  ${content.substring(0, 200).replace(/\n/g, '\n  ')}`);
            } catch (readErr) {
              console.error(`  Could not read playlist:`, readErr.message);
            }
          }
        }
      }, delayMs);
    };
    
    checkFileExists(outputPlaylist, 'Playlist (1s)', 1000);
    checkFileExists(outputPlaylist, 'Playlist (2s)', 2000);
    checkFileExists(outputPlaylist, 'Playlist (5s)', 5000);
    checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (3s)', 3000);
    checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (5s)', 5000);
    
    // List directory contents after 6 seconds
    setTimeout(() => {
      try {
        const files = fs.readdirSync(dir);
        console.log(`\n📁 Directory contents after 6s (${dir}):`);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);
          console.log(`  ${file} (${stats.size} bytes, ${stats.isDirectory() ? 'DIR' : 'FILE'})`);
        });
        
        // Also show log file contents if it exists
        const logPath = path.join(dir, 'ffmpeg_stdout.log');
        if (fs.existsSync(logPath)) {
          console.log(`\n📋 FFmpeg log file contents:`);
          const logContent = fs.readFileSync(logPath, 'utf8');
          console.log(logContent.split('\n').map(line => `  ${line}`).join('\n'));
        }
      } catch (listErr) {
        console.error(`Error listing directory:`, listErr.message);
      }
    }, 6000);
  });
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
    // Handle native FFmpeg processes differently
    if (ent.isNative) {
      console.log(`Stopping native FFmpeg process ${name} (PID: ${ent.pid})`);
      
      // Kill the process using system command
      try {
        execSync(`kill -TERM ${ent.pid}`, { stdio: 'ignore' });
        console.log(`Sent SIGTERM to native process ${ent.pid}`);
        
        // Wait briefly and check if process died
        setTimeout(() => {
          try {
            process.kill(ent.pid, 0);
            // Still running, force kill
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
    
    // Handle Node.js spawned processes (legacy code)
    const proc = ent.process;
    
    if (!proc || proc.killed) {
      console.log(`Process for ${name} already killed or invalid`);
      delete runningStreams[name];
      return false;
    }
    
    const pid = proc.pid;
    console.log(`Killing FFmpeg process ${name} (PID: ${pid})`);
    console.log(`Detected OS: ${process.platform}`);
    
    // ... (rest of legacy stop logic would go here if needed)
    delete runningStreams[name];
    return true;
    
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
    
    // Handle Node.js spawned processes
    const proc = ent.process;
    if (proc && !proc.killed) {
      try {
        proc.kill('SIGTERM');
        console.log(`Sent SIGTERM to spawned process ${proc.pid}`);
      } catch (e) {
        console.error(`Error sending SIGTERM:`, e.message);
      }
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

module.exports = {
  getRunningStreams,
  listStreams,
  startStream,
  stopStream,
  stopStreamSync,
  deleteStream,
  restoreStreams,
  loadStreamsMetadata,
  saveStreamsMetadata
};

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
 * Start FFmpeg HLS stream using persistent background process
 * This method keeps FFmpeg running as a child process for better control
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
  
  // Build FFmpeg arguments optimized for low resource usage and reliability
  const ffmpegArgs = [
    "-re",                           // Read input at native frame rate (important for live)
    "-stream_loop", "-1",            // Loop indefinitely
    "-i", filePath,                  // Input MP3 file
    "-c:a", "copy",                  // Copy audio codec (no re-encoding = low CPU)
    "-hls_time", "3",                // 3 second segments (better for pre-loading)
    "-hls_list_size", "6",           // Keep 6 segments in playlist (~18 seconds buffer)
    "-hls_flags", "delete_segments+round_durations", // Clean up old segments
    "-hls_segment_filename", outputSegment,
    "-hls_segment_type", "mpegts",   // Explicit MPEG-TS format
    outputPlaylist
  ];
  
  console.log(`\nFFmpeg command:`);
  console.log(`ffmpeg ${ffmpegArgs.join(' ')}`);
  
  // Spawn FFmpeg process WITH proper working directory
  const { spawn } = require("child_process");
  const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
    cwd: dir,                        // CRITICAL: Set working directory to output folder
    detached: false,                 // Keep attached for better control
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }          // Inherit environment
  });
  
  console.log(`FFmpeg process spawned with PID: ${ffmpeg.pid}`);
  console.log(`Working directory: ${dir}`);
  console.log(`Process spawned successfully - waiting for output files...\n`);
  
  // IMMEDIATELY list processes to confirm spawn
  try {
    const psOutput = execSync('ps aux | grep ffmpeg | grep -v grep', { encoding: 'utf8' });
    console.log(`✅ Confirmed FFmpeg running:`);
    console.log(psOutput.split('\n').map(l => `  ${l}`).join('\n'));
  } catch (e) {
    console.log(`⚠️ Could not verify FFmpeg process via ps command`);
  }
  
  // Store process info
  runningStreams[name] = { 
    process: ffmpeg,
    pid: ffmpeg.pid,
    isNative: false,                 // This is a spawned process
    startTime: new Date(),
    outputPlaylist: outputPlaylist,
    outputSegment: outputSegment,
    workingDir: dir,
    failed: false
  };
  
  // Monitor file creation
  let hasCreatedPlaylist = false;
  let hasStartedEncoding = false;
  
  const checkFileExists = (filePath, description, delayMs) => {
    setTimeout(() => {
      const exists = fs.existsSync(filePath);
      console.log(`${description} ${exists ? '✓ CREATED' : '❌ NOT YET CREATED'}: ${filePath}`);
      if (exists && description.includes('Playlist')) {
        hasCreatedPlaylist = true;
        const stats = fs.statSync(filePath);
        console.log(`  Playlist size: ${stats.size} bytes`);
        
        // Read and display playlist content
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          console.log(`  Playlist preview:`);
          console.log(`  ${content.substring(0, 300).replace(/\n/g, '\n  ')}`);
        } catch (readErr) {
          console.error(`  Could not read playlist:`, readErr.message);
        }
      }
    }, delayMs);
  };
  
  checkFileExists(outputPlaylist, 'Playlist (1s)', 1000);
  checkFileExists(outputPlaylist, 'Playlist (2s)', 2000);
  checkFileExists(outputPlaylist, 'Playlist (5s)', 5000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (2s)', 2000);
  checkFileExists(path.join(dir, 'seg_000.ts'), 'First segment (4s)', 4000);
  
  // Capture FFmpeg stderr output
  let stderrBuffer = '';
  ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString();
    stderrBuffer += msg;
    
    // Log important messages
    if (msg.includes('error') || msg.includes('Error') || msg.includes('Invalid') || msg.includes('Permission denied')) {
      console.error(`[FFmpeg ERROR] ${msg.trim()}`);
    } else if (msg.includes('Output #0') || msg.includes('hls') || msg.includes('muxer')) {
      console.log(`[FFmpeg INFO] ${msg.trim()}`);
    } else if (msg.includes('frame=') || msg.includes('time=')) {
      if (!hasStartedEncoding) {
        hasStartedEncoding = true;
        console.log(`✓ FFmpeg has started encoding!`);
        
        // List directory contents when encoding starts
        setTimeout(() => {
          try {
            const files = fs.readdirSync(dir);
            console.log(`\n📁 Directory contents (${dir}):`);
            files.forEach(file => {
              const fp = path.join(dir, file);
              const stats = fs.statSync(fp);
              console.log(`  ${file} (${stats.size} bytes)`);
            });
          } catch (listErr) {
            console.error(`Error listing directory:`, listErr.message);
          }
        }, 500);
      }
    }
  });
  
  // Handle FFmpeg stdout
  ffmpeg.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      console.log(`[FFmpeg STDOUT] ${msg}`);
    }
  });
  
  // Handle FFmpeg errors
  ffmpeg.on("error", (err) => {
    console.error(`\n❌ FFMPEG PROCESS ERROR for stream ${name}:`, err.message);
    console.error(`Error code:`, err.code);
    console.error(`Error syscall:`, err.syscall);
    console.error(`Spawn arguments were visible above`);
    
    if (runningStreams[name]) {
      runningStreams[name].failed = true;
    }
    
    // Update metadata
    const STREAMS_DB_FILE = path.join(__dirname, "..", "streams.json");
    let streamsMetadata = [];
    try {
      if (fs.existsSync(STREAMS_DB_FILE)) {
        streamsMetadata = JSON.parse(fs.readFileSync(STREAMS_DB_FILE, 'utf8'));
        const idx = streamsMetadata.findIndex(s => s.name === name);
        if (idx !== -1) {
          streamsMetadata[idx].failed = true;
          streamsMetadata[idx].errorMessage = err.message;
          fs.writeFileSync(STREAMS_DB_FILE, JSON.stringify(streamsMetadata, null, 2), 'utf8');
        }
      }
    } catch (metaErr) {
      console.error('Error updating metadata:', metaErr);
    }
    
    // CRITICAL: Show what files exist NOW
    console.error(`\n📁 Directory state after error:`);
    try {
      const errorFiles = fs.readdirSync(dir);
      console.error(`Files in ${dir}:`, errorFiles);
      
      // Check specifically for m3u8 files
      const m3u8Files = errorFiles.filter(f => f.endsWith('.m3u8'));
      if (m3u8Files.length > 0) {
        console.error(`⚠️ M3U8 files found:`, m3u8Files);
        m3u8Files.forEach(f => {
          const stats = fs.statSync(path.join(dir, f));
          console.error(`  ${f}: ${stats.size} bytes, modified ${stats.mtime}`);
        });
      } else {
        console.error(`❌ NO M3U8 FILES FOUND - this is the problem!`);
      }
    } catch (listErr) {
      console.error(`Cannot list directory:`, listErr.message);
    }
  });
  
  // Handle FFmpeg exit
  ffmpeg.on("exit", (code, signal) => {
    console.log(`\n========== FFMPEG EXIT: ${name} ==========`);
    console.log(`Exit code: ${code}`);
    console.log(`Exit signal: ${signal}`);
    console.log(`Has created playlist: ${hasCreatedPlaylist}`);
    console.log(`Playlist file exists: ${fs.existsSync(outputPlaylist)}`);
    
    if (runningStreams[name]) {
      if (code !== 0 && code !== null) {
        console.error(`\n❌ FFmpeg exited with code ${code} for stream ${name}`);
        console.error(`Last stderr output:`, stderrBuffer.split('\n').slice(-10).join('\n'));
        runningStreams[name].failed = true;
      } else {
        console.log(`\n✓ FFmpeg process ended normally for stream ${name}`);
      }
      delete runningStreams[name];
    }
    console.log(`=========================================\n`);
  });
  
  console.log(`\n---------- Stream ${name} initialization complete ----------\n`);
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

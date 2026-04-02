const express = require("express");
const router = express.Router();
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getRunningStreams } = require("../services/streamService");

/**
 * GET /__debug/streams - Debug endpoint to check streams folder structure
 */
router.get("/streams", (req, res) => {
  const streamsPath = path.join(__dirname, "..", "streams");
  
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

/**
 * GET /__debug/ffmpeg - Debug endpoint to check running FFmpeg processes
 */
router.get("/ffmpeg", (req, res) => {
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
  const runningStreams = getRunningStreams();
  Object.keys(runningStreams).forEach(name => {
    const stream = runningStreams[name];
    
    // Check if process is still alive
    let isAlive = false;
    try {
      if (stream.isNative) {
        process.kill(stream.pid, 0);
        isAlive = true;
      } else if (stream.process && !stream.process.killed) {
        isAlive = true;
      }
    } catch (e) {
      isAlive = false;
    }
    
    debugInfo.runningStreams[name] = {
      pid: stream.pid,
      isNative: stream.isNative || false,
      alive: isAlive,
      playlistExists: stream.outputPlaylist && fs.existsSync(stream.outputPlaylist),
      segmentPatternExists: stream.outputSegment ? fs.existsSync(path.dirname(stream.outputSegment)) : false,
      outputDir: stream.workingDir || (stream.outputPlaylist ? path.dirname(stream.outputPlaylist) : 'unknown'),
      workingDirectory: stream.workingDir,
      cwd: process.cwd(),
      logFile: stream.logFile || 'N/A',
      logFileExists: stream.logFile && fs.existsSync(stream.logFile)
    };
  });
  
  res.json(debugInfo);
});

module.exports = router;

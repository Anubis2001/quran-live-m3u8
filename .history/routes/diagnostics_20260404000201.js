const express = require("express");
const router = express.Router();
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getRunningStreams } = require("../services/streamService");
const { requirePermission } = require('../middleware/permissions');

/**
 * GET /__debug/streams - Debug endpoint to check streams folder structure
 */
router.get("/streams", requirePermission('system:diagnostics'), (req, res) => {
  const streamsPath = path.join(__dirname, "..", "streams");
  
  const debugInfo = {
    streamsExists: fs.existsSync(streamsPath),
    streamCount: 0,
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
          fileCount: files.length,
          files: fileInfo.map(f => ({ name: f.name, size: f.size, type: f.isDirectory ? 'directory' : 'file' }))
        });
      }
    });
  }
  
  res.json(debugInfo);
});

/**
 * GET /__debug/ffmpeg - Debug endpoint to check running FFmpeg processes
 */
router.get("/ffmpeg", requirePermission('system:diagnostics'), (req, res) => {
  const debugInfo = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    ffmpeg: {
      installed: false,
      version: null,
      processes: []
    },
    runningStreams: {}
  };
  
  // Check FFmpeg installation
  try {
    const version = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
    debugInfo.ffmpeg.installed = true;
    debugInfo.ffmpeg.version = version;
    // SECURITY: Don't expose system paths
    debugInfo.ffmpeg.path = '[hidden]';
  } catch (err) {
    debugInfo.ffmpeg.error = 'FFmpeg check failed';
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
      status: isAlive ? 'running' : 'stopped',
      type: stream.isNative ? 'native' : 'node'
    };
  });
  
  res.json(debugInfo);
});

module.exports = router;

#!/usr/bin/env node

/**
 * Quick test script to verify FFmpeg HLS generation works
 * Run this BEFORE starting the server to confirm your environment is set up correctly
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing FFmpeg HLS Generation...\n');

// Test 1: Check FFmpeg installation
console.log('Test 1: Checking FFmpeg installation...');
try {
  const ffmpegPath = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
  console.log(`✓ FFmpeg found at: ${ffmpegPath}`);
  
  const version = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
  console.log(`✓ Version: ${version}\n`);
} catch (err) {
  console.error('❌ FFMPEG NOT FOUND!');
  console.error('Install with: sudo apt install ffmpeg\n');
  process.exit(1);
}

// Test 2: Create test directory
const testDir = path.join(__dirname, 'test-hls-output');
console.log(`Test 2: Creating test directory: ${testDir}`);
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
  console.log(`✓ Created directory\n`);
} else {
  console.log(`✓ Directory already exists\n`);
}

// Test 3: Check for test audio file
const testAudio = path.join(__dirname, 'public', 'test.mp3');
let audioFile = testAudio;

if (!fs.existsSync(testAudio)) {
  // Try to find any MP3 in streams folder
  const streamsDir = path.join(__dirname, 'streams');
  if (fs.existsSync(streamsDir)) {
    const files = fs.readdirSync(streamsDir);
    for (const dir of files) {
      const dirPath = path.join(streamsDir, dir);
      if (fs.lstatSync(dirPath).isDirectory()) {
        const mp3Files = fs.readdirSync(dirPath).filter(f => f.endsWith('.mp3'));
        if (mp3Files.length > 0) {
          audioFile = path.join(dirPath, mp3Files[0]);
          break;
        }
      }
    }
  }
}

if (!fs.existsSync(audioFile)) {
  console.error('❌ No MP3 audio file found for testing!');
  console.error('Please upload an audio file first, or place a test.mp3 in public/ folder\n');
  process.exit(1);
}

console.log(`Test 3: Using audio file: ${audioFile}`);
console.log(`✓ Audio file found\n`);

// Test 4: Run FFmpeg command
console.log('Test 4: Running FFmpeg HLS generation...');
const outputPlaylist = path.join(testDir, 'test-stream.m3u8');
const outputSegment = path.join(testDir, 'seg_%03d.ts');

const ffmpegCmd = `ffmpeg -re -stream_loop -1 -i "${audioFile}" -c:a copy -hls_time 3 -hls_list_size 6 -hls_flags delete_segments+round_durations -hls_segment_filename "${outputSegment}" -hls_segment_type mpegts "${outputPlaylist}"`;

console.log(`Command: ${ffmpegCmd}\n`);

// Execute FFmpeg in background
const { spawn } = require('child_process');
const ffmpeg = spawn('ffmpeg', [
  '-re',
  '-stream_loop', '-1',
  '-i', audioFile,
  '-c:a', 'copy',
  '-hls_time', '3',
  '-hls_list_size', '6',
  '-hls_flags', 'delete_segments+round_durations',
  '-hls_segment_filename', outputSegment,
  '-hls_segment_type', 'mpegts',
  outputPlaylist
], {
  cwd: testDir,
  stdio: ['ignore', 'pipe', 'pipe']
});

console.log(`FFmpeg spawned with PID: ${ffmpeg.pid}`);

let stderrBuffer = '';
let success = false;

ffmpeg.stderr.on('data', (data) => {
  const msg = data.toString();
  stderrBuffer += msg;
  
  if (msg.includes('Output #0') || msg.includes('hls')) {
    console.log(`[FFmpeg] ${msg.trim()}`);
  }
});

// Check for file creation after 3 seconds
setTimeout(() => {
  console.log('\n📊 Checking output files...\n');
  
  const files = fs.readdirSync(testDir);
  console.log('Files created:', files.length);
  files.forEach(f => {
    const stats = fs.statSync(path.join(testDir, f));
    console.log(`  ${f}: ${stats.size} bytes`);
  });
  
  if (files.some(f => f.endsWith('.m3u8'))) {
    console.log('\n✅ SUCCESS! M3U8 file was created!');
    success = true;
    
    // Show playlist content
    const m3u8File = files.find(f => f.endsWith('.m3u8'));
    const content = fs.readFileSync(path.join(testDir, m3u8File), 'utf8');
    console.log(`\n📋 Playlist content:\n${content.substring(0, 500)}`);
  } else {
    console.log('\n❌ FAILED! No M3U8 file created.');
    console.log('\nLast FFmpeg output:');
    console.log(stderrBuffer.split('\n').slice(-10).join('\n'));
  }
  
  // Cleanup
  console.log('\n🧹 Cleaning up test files...');
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('✓ Test directory removed\n');
  } catch (e) {
    console.log('⚠️ Could not remove test directory - clean up manually\n');
  }
  
  // Kill FFmpeg
  try {
    ffmpeg.kill('SIGKILL');
  } catch (e) {}
  
  process.exit(success ? 0 : 1);
  
}, 3000);

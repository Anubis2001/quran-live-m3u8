/**
 * Test automatic stream discovery functionality
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('🔍 Testing Automatic Stream Discovery');
console.log('='.repeat(70));

// Clean up first
const streamsJsonPath = path.join(__dirname, 'streams.json');
fs.writeFileSync(streamsJsonPath, '[]', 'utf8');
console.log('\n1. Cleaned streams.json');

// Create test stream directories with different media types
const testStreams = [
  { name: 'quran_surah_rahman', file: 'audio.mp3', type: 'audio' },
  { name: 'quran_surah_yasin', file: 'recitation.m4a', type: 'audio' },
  { name: 'lecture_islamic', file: 'talk.wav', type: 'audio' }
];

const streamsDir = path.join(__dirname, 'streams');

console.log('\n2. Creating test stream directories with media files...');
testStreams.forEach(stream => {
  const streamDir = path.join(streamsDir, stream.name);
  
  // Create directory
  if (!fs.existsSync(streamDir)) {
    fs.mkdirSync(streamDir, { recursive: true });
  }
  
  // Create dummy media file
  const filePath = path.join(streamDir, stream.file);
  fs.writeFileSync(filePath, `dummy ${stream.type} content for testing`, 'utf8');
  
  console.log(`   ✓ Created: ${stream.name}/${stream.file}`);
});

// Verify streams.json is empty before restore
console.log('\n3. Verifying streams.json is empty...');
const beforeRestore = JSON.parse(fs.readFileSync(streamsJsonPath, 'utf8'));
console.log(`   Streams in metadata: ${beforeRestore.length}`);

// Now test the restore function
console.log('\n4. Running restoreStreams() to auto-discover streams...');
const { restoreStreams } = require('./services/streamService');

try {
  restoreStreams();
  console.log('   ✓ restoreStreams() completed');
} catch (err) {
  console.error('   ❌ Error:', err.message);
}

// Check what was discovered
console.log('\n5. Checking discovered streams...');
const afterRestore = JSON.parse(fs.readFileSync(streamsJsonPath, 'utf8'));
console.log(`   Total streams in metadata: ${afterRestore.length}`);

if (afterRestore.length > 0) {
  console.log('\n   Discovered streams:');
  afterRestore.forEach((stream, index) => {
    console.log(`   ${index + 1}. ${stream.name}`);
    console.log(`      File: ${path.basename(stream.filePath)}`);
    console.log(`      Source: ${stream.source || 'manual'}`);
    console.log(`      Created: ${stream.createdAt}`);
    
    // Verify it matches one of our test streams
    const match = testStreams.find(s => s.name === stream.name);
    if (match) {
      console.log(`      ✅ Auto-discovered correctly!`);
    } else {
      console.log(`      ⚠️  Unexpected stream`);
    }
    console.log('');
  });
} else {
  console.error('   ❌ No streams were discovered!');
}

// Cleanup
console.log('6. Cleaning up test data...');
try {
  testStreams.forEach(stream => {
    const streamDir = path.join(streamsDir, stream.name);
    if (fs.existsSync(streamDir)) {
      fs.rmSync(streamDir, { recursive: true, force: true });
    }
  });
  fs.writeFileSync(streamsJsonPath, '[]', 'utf8');
  console.log('   ✓ All test files removed');
} catch (err) {
  console.error('   ⚠️  Cleanup warning:', err.message);
}

console.log('\n' + '='.repeat(70));
console.log('✅ Stream discovery test completed!');
console.log('='.repeat(70) + '\n');

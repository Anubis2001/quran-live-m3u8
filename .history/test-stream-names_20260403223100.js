/**
 * Test stream name display functionality
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('🧪 Testing Stream Name Display Functionality');
console.log('='.repeat(70));

// Clean up any existing test data
const streamsJsonPath = path.join(__dirname, 'streams.json');
console.log('\n1. Cleaning up test data...');
fs.writeFileSync(streamsJsonPath, '[]', 'utf8');
console.log('   ✓ streams.json cleared');

// Create a test stream directory with an MP3 file
const testStreamName = 'test_quran_surah';
const streamDir = path.join(__dirname, 'streams', testStreamName);

console.log(`\n2. Creating test stream: ${testStreamName}`);
if (!fs.existsSync(streamDir)) {
  fs.mkdirSync(streamDir, { recursive: true });
}
console.log(`   ✓ Created directory: ${streamDir}`);

// Create a dummy MP3 file (just a small file for testing)
const mp3Path = path.join(streamDir, 'audio.mp3');
fs.writeFileSync(mp3Path, 'dummy audio content for testing', 'utf8');
console.log(`   ✓ Created dummy MP3: ${mp3Path}`);

// Add stream to metadata
const streamsMetadata = [
  {
    name: testStreamName,
    filePath: mp3Path,
    createdAt: new Date().toISOString()
  }
];

fs.writeFileSync(streamsJsonPath, JSON.stringify(streamsMetadata, null, 2), 'utf8');
console.log(`   ✓ Added to streams.json`);

// Test the listStreams function
console.log('\n3. Testing listStreams function...');
const { listStreams } = require('./services/streamService');

// Mock request object
const mockReq = {
  protocol: 'http',
  get: (header) => {
    if (header === 'host') return 'localhost:8300';
    return null;
  }
};

try {
  const streams = listStreams(mockReq);
  console.log(`   ✓ Retrieved ${streams.length} stream(s)`);
  
  if (streams.length > 0) {
    streams.forEach((stream, index) => {
      console.log(`\n   Stream ${index + 1}:`);
      console.log(`     Name: ${stream.name}`);
      console.log(`     Status: ${stream.status}`);
      console.log(`     URL: ${stream.url}`);
      
      // Verify the stream name matches what we created
      if (stream.name === testStreamName) {
        console.log(`     ✅ Stream name is CORRECT!`);
      } else {
        console.error(`     ❌ Stream name is WRONG! Expected: ${testStreamName}, Got: ${stream.name}`);
      }
    });
  } else {
    console.error('   ❌ No streams found in list!');
  }
} catch (err) {
  console.error('   ❌ Error listing streams:', err.message);
}

// Test restore function
console.log('\n4. Testing restoreStreams function...');
const { restoreStreams } = require('./services/streamService');

try {
  // This should find our test stream and keep it
  restoreStreams();
  console.log('   ✓ restoreStreams completed');
  
  // Check streams.json after restore
  const afterRestore = JSON.parse(fs.readFileSync(streamsJsonPath, 'utf8'));
  console.log(`   ✓ Found ${afterRestore.length} valid stream(s) after restore`);
  
  if (afterRestore.length > 0 && afterRestore[0].name === testStreamName) {
    console.log(`   ✅ Test stream preserved correctly!`);
  } else if (afterRestore.length === 0) {
    console.error(`   ❌ Test stream was removed (file might not exist check failed)`);
  }
} catch (err) {
  console.error('   ❌ Error during restore:', err.message);
}

// Cleanup
console.log('\n5. Cleaning up test data...');
try {
  fs.unlinkSync(mp3Path);
  fs.rmdirSync(streamDir);
  fs.writeFileSync(streamsJsonPath, '[]', 'utf8');
  console.log('   ✓ Test files removed');
} catch (err) {
  console.error('   ⚠️  Cleanup warning:', err.message);
}

console.log('\n' + '='.repeat(70));
console.log('✅ Stream name display test completed!');
console.log('='.repeat(70) + '\n');

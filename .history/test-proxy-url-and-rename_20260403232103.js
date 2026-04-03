/**
 * Test proxy-aware URL generation and stream renaming
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('🧪 Testing Proxy-Aware URLs & Stream Renaming');
console.log('='.repeat(70));

// Clean up first
const streamsJsonPath = path.join(__dirname, 'streams.json');
fs.writeFileSync(streamsJsonPath, '[]', 'utf8');

// Create a test stream directory with an Arabic name
const testStreamName = 'تلاوة_القرآن'; // "Quran Recitation" in Arabic
const streamDir = path.join(__dirname, 'streams', testStreamName);

console.log('\n1. Creating test stream with Arabic name...');
if (!fs.existsSync(streamDir)) {
  fs.mkdirSync(streamDir, { recursive: true });
}

const mp3Path = path.join(streamDir, 'audio.mp3');
fs.writeFileSync(mp3Path, 'dummy audio content for testing', 'utf8');
console.log(`   ✓ Created: ${testStreamName}/audio.mp3`);

// Add stream to metadata
const streamsMetadata = [
  {
    name: testStreamName,
    filePath: mp3Path,
    createdAt: new Date().toISOString()
  }
];

fs.writeFileSync(streamsJsonPath, JSON.stringify(streamsMetadata, null, 2), 'utf8');
console.log('   ✓ Added to streams.json');

// Test listStreams with different request headers
console.log('\n2. Testing proxy-aware URL generation...');
const { listStreams } = require('./services/streamService');

// Test Case 1: Direct access (localhost)
console.log('\n   Test Case 1: Direct localhost access');
const mockReq1 = {
  protocol: 'http',
  get: (header) => {
    if (header === 'host') return 'localhost:8300';
    if (header === 'X-Forwarded-Host') return undefined;
    if (header === 'X-Forwarded-Proto') return undefined;
    return null;
  }
};

try {
  const streams1 = listStreams(mockReq1);
  console.log(`   URL: ${streams1[0].url}`);
  console.log(`   ✅ Correctly shows localhost`);
} catch (err) {
  console.error('   ❌ Error:', err.message);
}

// Test Case 2: Behind reverse proxy with X-Forwarded-Host
console.log('\n   Test Case 2: Behind Nginx/Apache proxy');
const mockReq2 = {
  protocol: 'http',
  get: (header) => {
    if (header === 'host') return 'localhost:8300';
    if (header === 'X-Forwarded-Host') return 'stream.maxhost.space';
    if (header === 'X-Forwarded-Proto') return 'https';
    return null;
  }
};

try {
  const streams2 = listStreams(mockReq2);
  console.log(`   URL: ${streams2[0].url}`);
  if (streams2[0].url.includes('stream.maxhost.space')) {
    console.log('   ✅ Correctly uses X-Forwarded-Host header!');
  } else {
    console.log('   ❌ Did not use proxy header correctly');
  }
} catch (err) {
  console.error('   ❌ Error:', err.message);
}

// Test Case 3: HTTPS proxy
console.log('\n   Test Case 3: HTTPS proxy connection');
const mockReq3 = {
  protocol: 'http',
  get: (header) => {
    if (header === 'host') return 'localhost:8300';
    if (header === 'X-Forwarded-Host') return 'example.com';
    if (header === 'X-Forwarded-Proto') return 'https';
    return null;
  }
};

try {
  const streams3 = listStreams(mockReq3);
  console.log(`   URL: ${streams3[0].url}`);
  if (streams3[0].url.startsWith('https://')) {
    console.log('   ✅ Correctly uses HTTPS from X-Forwarded-Proto!');
  } else {
    console.log('   ⚠️  Not using HTTPS from proxy header');
  }
} catch (err) {
  console.error('   ❌ Error:', err.message);
}

// Test rename functionality
console.log('\n3. Testing stream rename with Arabic characters...');
const { renameStream } = require('./services/streamService');

async function testRename() {
  try {
    // Rename from Arabic to another Arabic name
    const newName = 'تلاوة_سورة_الرحمن'; // "Surah Rahman Recitation"
    console.log(`   Original name: ${testStreamName}`);
    console.log(`   New name: ${newName}`);
    
    const result = await renameStream(testStreamName, newName);
    
    if (result.success) {
      console.log('   ✅ Stream renamed successfully!');
      console.log(`   Old Name: ${result.oldName}`);
      console.log(`   New Name: ${result.newName}`);
      console.log(`   URL: ${result.url}`);
      
      // Verify directory was renamed
      const oldDirExists = fs.existsSync(streamDir);
      const newDirPath = path.join(__dirname, 'streams', newName);
      const newDirExists = fs.existsSync(newDirPath);
      
      console.log(`\n   Directory check:`);
      console.log(`     Old directory exists: ${oldDirExists ? '❌ YES (bad)' : '✅ NO (good)'}`);
      console.log(`     New directory exists: ${newDirExists ? '✅ YES (good)' : '❌ NO (bad)'}`);
      
      // Verify metadata was updated
      const updatedMetadata = JSON.parse(fs.readFileSync(streamsJsonPath, 'utf8'));
      const foundInMetadata = updatedMetadata.some(s => s.name === newName);
      console.log(`     Found in metadata: ${foundInMetadata ? '✅ YES' : '❌ NO'}`);
      
      // Test renaming back
      console.log('\n4. Testing rename back to original...');
      const result2 = await renameStream(newName, testStreamName);
      if (result2.success) {
        console.log('   ✅ Successfully renamed back to original!');
      } else {
        console.log('   ❌ Failed to rename back:', result2.error);
      }
    } else {
      console.error('   ❌ Rename failed:', result.error);
    }
  } catch (err) {
    console.error('   ❌ Error during rename test:', err.message);
    console.error(err.stack);
  }
  
  // Cleanup
  console.log('\n5. Cleaning up...');
  try {
    // Stop any running FFmpeg processes
    const { stopStream } = require('./services/streamService');
    stopStream(testStreamName);
    
    setTimeout(() => {
      try {
        const finalDir = path.join(__dirname, 'streams', testStreamName);
        if (fs.existsSync(finalDir)) {
          fs.rmSync(finalDir, { recursive: true, force: true });
        }
        fs.writeFileSync(streamsJsonPath, '[]', 'utf8');
        console.log('   ✓ Test files removed');
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ All tests completed!');
        console.log('='.repeat(70) + '\n');
      } catch (err) {
        console.error('   ⚠️  Cleanup warning:', err.message);
      }
    }, 1000);
  } catch (err) {
    console.error('   ⚠️  Cleanup error:', err.message);
  }
}

testRename();

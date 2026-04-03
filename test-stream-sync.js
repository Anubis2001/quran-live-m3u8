/**
 * Comprehensive Stream Synchronization Test
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('🧪 COMPREHENSIVE STREAM SYNCHRONIZATION TEST');
console.log('='.repeat(70));

const streamsJsonPath = path.join(__dirname, 'streams.json');
const streamsDir = path.join(__dirname, 'streams');

// Helper function to clean up
function cleanup() {
  try {
    // Stop any running FFmpeg processes
    const { stopStream } = require('./services/streamService');
    
    // Clean directories
    if (fs.existsSync(streamsDir)) {
      const folders = fs.readdirSync(streamsDir);
      folders.forEach(folder => {
        const folderPath = path.join(streamsDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
          try {
            fs.rmSync(folderPath, { recursive: true, force: true });
          } catch (e) {
            // Ignore locked files
          }
        }
      });
    }
    
    // Reset streams.json
    fs.writeFileSync(streamsJsonPath, '[]', 'utf8');
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

// Start fresh
cleanup();
console.log('\n✓ Cleaned up test environment');

// ===== TEST SCENARIO 1: Add missing streams from filesystem =====
console.log('\n' + '='.repeat(70));
console.log('TEST 1: Adding missing streams from filesystem');
console.log('='.repeat(70));

console.log('\n1.1 Creating test stream directories...');
const testStreams = [
  { name: 'quran_surah_rahman', file: 'audio.mp3', type: 'audio' },
  { name: 'تلاوة_القرآن', file: 'recitation.m4a', type: 'audio' }, // Arabic name
  { name: 'lecture_islamic', file: 'talk.wav', type: 'audio' }
];

testStreams.forEach(stream => {
  const streamDir = path.join(streamsDir, stream.name);
  if (!fs.existsSync(streamDir)) {
    fs.mkdirSync(streamDir, { recursive: true });
  }
  
  const filePath = path.join(streamDir, stream.file);
  fs.writeFileSync(filePath, `dummy ${stream.type} content`, 'utf8');
  console.log(`   ✓ Created: ${stream.name}/${stream.file}`);
});

// Create a streams.json with only ONE of them (to test auto-discovery)
console.log('\n1.2 Setting up partial registry (only 1 of 3 streams)...');
const partialMetadata = [
  {
    name: 'quran_surah_rahman',
    filePath: path.join(streamsDir, 'quran_surah_rahman', 'audio.mp3'),
    createdAt: new Date().toISOString()
  }
];
fs.writeFileSync(streamsJsonPath, JSON.stringify(partialMetadata, null, 2), 'utf8');
console.log('   ✓ streams.json contains only: quran_surah_rahman');

console.log('\n1.3 Running restoreStreams() to sync...');
const { restoreStreams } = require('./services/streamService');
restoreStreams();

console.log('\n1.4 Verifying synchronization...');
const afterTest1 = JSON.parse(fs.readFileSync(streamsJsonPath, 'utf8'));
console.log(`   Total streams in registry: ${afterTest1.length}`);

if (afterTest1.length === 3) {
  console.log('   ✅ PASS: All 3 streams now in registry');
  afterTest1.forEach(s => {
    console.log(`      - ${s.name}${s.source === 'auto-discovered' ? ' (auto-discovered)' : ''}`);
  });
} else {
  console.error(`   ❌ FAIL: Expected 3 streams, got ${afterTest1.length}`);
}

// ===== TEST SCENARIO 2: Remove orphaned entries =====
console.log('\n' + '='.repeat(70));
console.log('TEST 2: Removing orphaned metadata entries');
console.log('='.repeat(70));

console.log('\n2.1 Deleting one stream directory from filesystem...');
const dirToDelete = path.join(streamsDir, 'lecture_islamic');
if (fs.existsSync(dirToDelete)) {
  fs.rmSync(dirToDelete, { recursive: true, force: true });
  console.log('   🗑️  Deleted: lecture_islamic directory');
}

console.log('\n2.2 Running restoreStreams() to clean up...');
restoreStreams();

console.log('\n2.3 Verifying orphan removal...');
const afterTest2 = JSON.parse(fs.readFileSync(streamsJsonPath, 'utf8'));
console.log(`   Total streams in registry: ${afterTest2.length}`);

const hasOrphanedEntry = afterTest2.some(s => s.name === 'lecture_islamic');
if (!hasOrphanedEntry && afterTest2.length === 2) {
  console.log('   ✅ PASS: Orphaned entry removed successfully');
  afterTest2.forEach(s => {
    console.log(`      - ${s.name}`);
  });
} else {
  console.error('   ❌ FAIL: Orphaned entry still exists or wrong count');
}

// ===== TEST SCENARIO 3: Invalid file paths cleanup =====
console.log('\n' + '='.repeat(70));
console.log('TEST 3: Cleaning invalid/placeholder file paths');
console.log('='.repeat(70));

console.log('\n3.1 Adding invalid entries to streams.json...');
const metadataWithInvalid = [
  ...afterTest2,
  {
    name: 'invalid_placeholder',
    filePath: '[protected]',
    createdAt: new Date().toISOString()
  },
  {
    name: 'missing_file',
    filePath: path.join(streamsDir, 'nonexistent', 'file.mp3'),
    createdAt: new Date().toISOString()
  }
];
fs.writeFileSync(streamsJsonPath, JSON.stringify(metadataWithInvalid, null, 2), 'utf8');
console.log('   ✓ Added 2 invalid entries');

console.log('\n3.2 Running restoreStreams() to validate...');
restoreStreams();

console.log('\n3.3 Verifying cleanup...');
const afterTest3 = JSON.parse(fs.readFileSync(streamsJsonPath, 'utf8'));
console.log(`   Total streams in registry: ${afterTest3.length}`);

const hasPlaceholder = afterTest3.some(s => s.filePath === '[protected]');
const hasMissingFile = afterTest3.some(s => !fs.existsSync(s.filePath));

if (!hasPlaceholder && !hasMissingFile && afterTest3.length === 2) {
  console.log('   ✅ PASS: Invalid entries cleaned successfully');
} else {
  console.error('   ❌ FAIL: Invalid entries remain');
}

// ===== TEST SCENARIO 4: Unicode/Arabic support =====
console.log('\n' + '='.repeat(70));
console.log('TEST 4: Unicode and Arabic character support');
console.log('='.repeat(70));

console.log('\n4.1 Checking Arabic stream name preservation...');
const arabicStream = afterTest3.find(s => s.name.includes('القرآن'));
if (arabicStream) {
  console.log(`   ✓ Arabic name preserved: ${arabicStream.name}`);
  console.log('   ✅ PASS: Unicode characters maintained correctly');
} else {
  console.error('   ❌ FAIL: Arabic stream not found');
}

// ===== TEST SCENARIO 5: Media file detection =====
console.log('\n' + '='.repeat(70));
console.log('TEST 5: Media file type detection');
console.log('='.repeat(70));

console.log('\n5.1 Verifying media file associations...');
afterTest3.forEach(stream => {
  const fileExists = fs.existsSync(stream.filePath);
  const fileName = path.basename(stream.filePath);
  console.log(`   ${stream.name}:`);
  console.log(`     File: ${fileName}`);
  console.log(`     Exists: ${fileExists ? '✅' : '❌'}`);
});

// ===== TEST SCENARIO 6: Empty directory handling =====
console.log('\n' + '='.repeat(70));
console.log('TEST 6: Empty directory handling');
console.log('='.repeat(70));

console.log('\n6.1 Creating empty stream directory...');
const emptyDir = path.join(streamsDir, 'empty_stream');
if (!fs.existsSync(emptyDir)) {
  fs.mkdirSync(emptyDir, { recursive: true });
}
console.log('   ✓ Created empty directory');

console.log('\n6.2 Running restoreStreams()...');
restoreStreams();

console.log('\n6.3 Verifying empty directory not added...');
const afterTest6 = JSON.parse(fs.readFileSync(streamsJsonPath, 'utf8'));
const hasEmptyStream = afterTest6.some(s => s.name === 'empty_stream');

if (!hasEmptyStream) {
  console.log('   ✅ PASS: Empty directory correctly ignored');
} else {
  console.error('   ❌ FAIL: Empty directory was added to registry');
}

// Clean up empty directory
fs.rmSync(emptyDir, { recursive: true, force: true });

// ===== FINAL SUMMARY =====
console.log('\n' + '='.repeat(70));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(70));

console.log('\nTests performed:');
console.log('  1. Auto-discovery of missing streams');
console.log('  2. Removal of orphaned metadata entries');
console.log('  3. Cleanup of invalid file paths');
console.log('  4. Unicode/Arabic character preservation');
console.log('  5. Media file association verification');
console.log('  6. Empty directory handling');

console.log('\nFinal state:');
console.log(`  Streams in registry: ${afterTest6.length}`);
afterTest6.forEach(s => {
  console.log(`    - ${s.name} (${path.basename(s.filePath)})`);
});

// Final cleanup
console.log('\n' + '='.repeat(70));
console.log('🧹 CLEANUP');
console.log('='.repeat(70));
cleanup();
console.log('✓ Test environment cleaned');

console.log('\n' + '='.repeat(70));
console.log('✅ ALL TESTS COMPLETED');
console.log('='.repeat(70) + '\n');


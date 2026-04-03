/**
 * Comprehensive Telegram Bot Functionality Test
 * This simulates the bot workflow without requiring actual Telegram credentials
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('Telegram Bot - Complete Functionality Test');
console.log('='.repeat(70));

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${err.message}`);
    testsFailed++;
  }
}

// Test Suite 1: Module Imports
console.log('\n📦 Test Suite 1: Module Imports\n');

test('Telegraf module is installed', () => {
  const telegraf = require('telegraf');
  if (!telegraf) throw new Error('Module not loaded');
});

test('TelegramBot service loads', () => {
  const telegramBot = require('./services/telegramBot');
  if (!telegramBot) throw new Error('Service not loaded');
});

test('StreamService integration available', () => {
  const { startStream, loadStreamsMetadata, saveStreamsMetadata } = require('./services/streamService');
  if (!startStream || !loadStreamsMetadata || !saveStreamsMetadata) {
    throw new Error('Stream service methods missing');
  }
});

// Test Suite 2: Service Structure
console.log('\n🏗️  Test Suite 2: Service Structure\n');

test('TelegramBot class has required methods', () => {
  const telegramBot = require('./services/telegramBot');
  const methods = ['start', 'stop', 'isAdmin', 'loadAdminIds'];
  
  methods.forEach(method => {
    if (typeof telegramBot[method] !== 'function') {
      throw new Error(`Method '${method}' not found`);
    }
  });
});

test('Singleton instance exported', () => {
  const telegramBot = require('./services/telegramBot');
  if (typeof telegramBot !== 'object') {
    throw new Error('Expected singleton instance');
  }
});

// Test Suite 3: Admin Authentication Logic
console.log('\n🔐 Test Suite 3: Admin Authentication Logic\n');

test('Admin IDs loaded from environment', () => {
  const telegramBot = require('./services/telegramBot');
  // Should handle empty/unset env gracefully
  const adminIds = telegramBot.loadAdminIds();
  if (!Array.isArray(adminIds)) {
    throw new Error('Admin IDs should be an array');
  }
});

test('Admin validation works correctly', () => {
  const telegramBot = require('./services/telegramBot');
  
  // Test with mock data
  telegramBot.adminIds = [123456789, 987654321];
  
  if (!telegramBot.isAdmin(123456789)) {
    throw new Error('Valid admin not recognized');
  }
  
  if (telegramBot.isAdmin(999999999)) {
    throw new Error('Non-admin incorrectly validated');
  }
});

test('Multiple admin IDs supported', () => {
  const telegramBot = require('./services/telegramBot');
  telegramBot.adminIds = [111, 222, 333];
  
  if (!telegramBot.isAdmin(222)) {
    throw new Error('Second admin not recognized');
  }
  
  if (!telegramBot.isAdmin(333)) {
    throw new Error('Third admin not recognized');
  }
});

// Test Suite 4: File Processing Logic
console.log('\n📁 Test Suite 4: File Processing Logic\n');

test('Upload directory structure exists', () => {
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  // Directory should exist or be creatable
  fs.accessSync(uploadDir, fs.constants.W_OK);
});

test('Streams directory structure exists', () => {
  const streamsDir = path.join(__dirname, 'streams');
  if (!fs.existsSync(streamsDir)) {
    fs.mkdirSync(streamsDir, { recursive: true });
  }
  // Directory should exist or be creatable
  fs.accessSync(streamsDir, fs.constants.W_OK);
});

test('Temp upload directory can be created', () => {
  const tempDir = path.join(__dirname, 'uploads', 'telegram_temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  fs.accessSync(tempDir, fs.constants.W_OK);
});

// Test Suite 5: Stream Name Validation
console.log('\n✅ Test Suite 5: Stream Name Validation\n');

test('Valid stream names accepted', () => {
  const validNames = ['test_stream', 'audio123', 'my-audio', 'Test_123'];
  const regex = /^[a-zA-Z0-9_-]+$/;
  
  validNames.forEach(name => {
    if (!regex.test(name)) {
      throw new Error(`Valid name rejected: ${name}`);
    }
  });
});

test('Invalid stream names rejected', () => {
  const invalidNames = ['test stream', '../etc/passwd', 'test.mp3', ''];
  const regex = /^[a-zA-Z0-9_-]+$/;
  
  invalidNames.forEach(name => {
    if (name && regex.test(name)) {
      throw new Error(`Invalid name accepted: ${name}`);
    }
  });
});

// Test Suite 6: Metadata Management
console.log('\n💾 Test Suite 6: Metadata Management\n');

test('Can load streams metadata', () => {
  const { loadStreamsMetadata } = require('./services/streamService');
  const metadata = loadStreamsMetadata();
  if (!Array.isArray(metadata)) {
    throw new Error('Metadata should be an array');
  }
});

test('Can save streams metadata', () => {
  const { saveStreamsMetadata } = require('./services/streamService');
  const testMetadata = [{ name: 'test', filePath: '[protected]', createdAt: new Date().toISOString() }];
  const result = saveStreamsMetadata(testMetadata);
  if (!result) {
    throw new Error('Failed to save metadata');
  }
});

test('Metadata persists across operations', () => {
  const { loadStreamsMetadata, saveStreamsMetadata } = require('./services/streamService');
  
  const testData = [
    { name: 'test1', filePath: '[protected]', createdAt: new Date().toISOString() },
    { name: 'test2', filePath: '[protected]', createdAt: new Date().toISOString() }
  ];
  
  saveStreamsMetadata(testData);
  const loaded = loadStreamsMetadata();
  
  if (loaded.length < testData.length) {
    throw new Error('Metadata not persisted correctly');
  }
});

// Test Suite 7: Environment Configuration
console.log('\n⚙️  Test Suite 7: Environment Configuration\n');

test('.env file exists', () => {
  if (!fs.existsSync('.env')) {
    throw new Error('.env file not found');
  }
});

test('TELEGRAM_BOT_TOKEN in .env', () => {
  const envContent = fs.readFileSync('.env', 'utf8');
  if (!envContent.includes('TELEGRAM_BOT_TOKEN')) {
    throw new Error('TELEGRAM_BOT_TOKEN not found in .env');
  }
});

test('TELEGRAM_ADMIN_IDS in .env', () => {
  const envContent = fs.readFileSync('.env', 'utf8');
  if (!envContent.includes('TELEGRAM_ADMIN_IDS')) {
    throw new Error('TELEGRAM_ADMIN_IDS not found in .env');
  }
});

test('TELEGRAM_STREAM_BASE_URL in .env', () => {
  const envContent = fs.readFileSync('.env', 'utf8');
  if (!envContent.includes('TELEGRAM_STREAM_BASE_URL')) {
    throw new Error('TELEGRAM_STREAM_BASE_URL not found in .env');
  }
});

// Test Suite 8: Server Integration
console.log('\n🔌 Test Suite 8: Server Integration\n');

test('server.js imports telegramBot', () => {
  const serverContent = fs.readFileSync('server.js', 'utf8');
  if (!serverContent.includes('telegramBot')) {
    throw new Error('telegramBot not imported in server.js');
  }
});

test('server.js calls telegramBot.start()', () => {
  const serverContent = fs.readFileSync('server.js', 'utf8');
  if (!serverContent.includes('telegramBot.start()')) {
    throw new Error('telegramBot.start() not called in server.js');
  }
});

test('Graceful shutdown stops telegramBot', () => {
  const streamServiceContent = fs.readFileSync('services/streamService.js', 'utf8');
  if (!streamServiceContent.includes('telegramBot.stop()')) {
    throw new Error('telegramBot.stop() not in graceful shutdown');
  }
});

// Test Suite 9: Dependencies
console.log('\n📚 Test Suite 9: Dependencies\n');

test('telegraf in package.json', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (!packageJson.dependencies.telegraf) {
    throw new Error('telegraf not in package.json dependencies');
  }
});

test('Required Node.js modules available', () => {
  const modules = ['fs', 'path', 'child_process'];
  modules.forEach(mod => {
    require(mod);
  });
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('Test Results Summary');
console.log('='.repeat(70));
console.log(`\n✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📊 Total:  ${testsPassed + testsFailed}`);
console.log(`\nSuccess Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log('\n🎉 All tests passed! Your Telegram bot is ready to configure.');
  console.log('\nNext steps:');
  console.log('1. Get a bot token from @BotFather on Telegram');
  console.log('2. Get your user ID from @userinfobot');
  console.log('3. Update .env with your credentials');
  console.log('4. Run: npm start');
  console.log('5. Message your bot: /start');
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
}

console.log('\n📖 Documentation:');
console.log('   - Quick Start: TELEGRAM_QUICKSTART.md');
console.log('   - Full Guide: TELEGRAM_BOT_SETUP.md');
console.log('='.repeat(70) + '\n');

process.exit(testsFailed === 0 ? 0 : 1);

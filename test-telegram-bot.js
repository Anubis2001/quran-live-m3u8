/**
 * Test script to verify Telegram bot integration
 */

console.log('='.repeat(60));
console.log('Telegram Bot Integration Test');
console.log('='.repeat(60));

// Test 1: Check if telegraf is installed
console.log('\n✓ Test 1: Checking telegraf installation...');
try {
  const telegraf = require('telegraf');
  console.log('  ✓ Telegraf module found');
} catch (err) {
  console.error('  ✗ Telegraf module not found. Run: npm install telegraf');
  process.exit(1);
}

// Test 2: Check if telegramBot service exists
console.log('\n✓ Test 2: Checking telegramBot service...');
try {
  const telegramBot = require('./services/telegramBot');
  
  if (telegramBot && typeof telegramBot.start === 'function') {
    console.log('  ✓ telegramBot service exists');
    console.log('  ✓ telegramBot.start() method available');
  } else {
    console.error('  ✗ telegramBot service is missing start method');
  }
  
  if (typeof telegramBot.stop === 'function') {
    console.log('  ✓ telegramBot.stop() method available');
  } else {
    console.error('  ✗ telegramBot.stop() method missing');
  }
} catch (err) {
  console.error('  ✗ Error loading telegramBot service:', err.message);
}

// Test 3: Check environment variables
console.log('\n✓ Test 3: Checking environment configuration...');
const fs = require('fs');
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  
  if (envContent.includes('TELEGRAM_BOT_TOKEN')) {
    console.log('  ✓ TELEGRAM_BOT_TOKEN found in .env');
    
    // Check if it's set to actual value or placeholder
    const tokenMatch = envContent.match(/TELEGRAM_BOT_TOKEN=(.+)/);
    if (tokenMatch && tokenMatch[1] && !tokenMatch[1].includes('your_bot_token')) {
      console.log('  ✓ TELEGRAM_BOT_TOKEN appears to be configured');
    } else {
      console.log('  ⚠ TELEGRAM_BOT_TOKEN is still set to placeholder value');
      console.log('    Please update it with your actual bot token from @BotFather');
    }
  } else {
    console.error('  ✗ TELEGRAM_BOT_TOKEN not found in .env');
  }
  
  if (envContent.includes('TELEGRAM_ADMIN_IDS')) {
    console.log('  ✓ TELEGRAM_ADMIN_IDS found in .env');
    
    const idsMatch = envContent.match(/TELEGRAM_ADMIN_IDS=(.+)/);
    if (idsMatch && idsMatch[1] && !idsMatch[1].includes('your_telegram_user_id')) {
      console.log('  ✓ TELEGRAM_ADMIN_IDS appears to be configured');
    } else {
      console.log('  ⚠ TELEGRAM_ADMIN_IDS is still set to placeholder value');
      console.log('    Please update it with your Telegram user ID');
    }
  } else {
    console.error('  ✗ TELEGRAM_ADMIN_IDS not found in .env');
  }
  
  if (envContent.includes('TELEGRAM_STREAM_BASE_URL')) {
    console.log('  ✓ TELEGRAM_STREAM_BASE_URL found in .env');
  } else {
    console.error('  ✗ TELEGRAM_STREAM_BASE_URL not found in .env');
  }
  
} catch (err) {
  console.error('  ✗ Error reading .env file:', err.message);
}

// Test 4: Check server.js integration
console.log('\n✓ Test 4: Checking server.js integration...');
try {
  const serverContent = fs.readFileSync('server.js', 'utf8');
  
  if (serverContent.includes('telegramBot')) {
    console.log('  ✓ telegramBot imported in server.js');
  } else {
    console.error('  ✗ telegramBot not imported in server.js');
  }
  
  if (serverContent.includes('telegramBot.start()')) {
    console.log('  ✓ telegramBot.start() called in server.js');
  } else {
    console.error('  ✗ telegramBot.start() not called in server.js');
  }
} catch (err) {
  console.error('  ✗ Error reading server.js:', err.message);
}

// Test 5: Check graceful shutdown integration
console.log('\n✓ Test 5: Checking graceful shutdown integration...');
try {
  const streamServiceContent = fs.readFileSync('services/streamService.js', 'utf8');
  
  if (streamServiceContent.includes('telegramBot.stop()')) {
    console.log('  ✓ telegramBot.stop() called in graceful shutdown');
  } else {
    console.error('  ✗ telegramBot.stop() not called in graceful shutdown');
  }
} catch (err) {
  console.error('  ✗ Error reading streamService.js:', err.message);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('Test Summary');
console.log('='.repeat(60));
console.log('All integration checks completed!');
console.log('\nNext steps:');
console.log('1. Update .env with your actual bot token and admin IDs');
console.log('2. Start the server: npm start');
console.log('3. Send /start to your bot on Telegram');
console.log('4. Try uploading an audio file');
console.log('\nFor detailed setup instructions, see: TELEGRAM_BOT_SETUP.md');
console.log('='.repeat(60) + '\n');

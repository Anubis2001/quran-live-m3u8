/**
 * Comprehensive Security Audit Test
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('🔒 COMPREHENSIVE SECURITY AUDIT');
console.log('='.repeat(70));

let passed = 0;
let failed = 0;
let warnings = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`⚠️  ${name}`);
      console.log(`   Note: ${result}`);
      warnings++;
    }
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

// ===== SECTION 1: Environment Security =====
console.log('\n📋 SECTION 1: Environment & Configuration Security\n');

test('.env file exists and is not empty', () => {
  if (!fs.existsSync('.env')) throw new Error('.env file missing');
  const content = fs.readFileSync('.env', 'utf8').trim();
  if (!content) throw new Error('.env file is empty');
});

test('TELEGRAM_BOT_TOKEN is not logged in full', () => {
  const telegramBot = fs.readFileSync('services/telegramBot.js', 'utf8');
  // Check that only substring is logged (first 10 chars)
  if (telegramBot.includes('console.log(`   Token: ${this.token.substring(0, 10)}...`)')) {
    return true;
  }
  throw new Error('Full token might be logged');
});

test('No hardcoded credentials in source code', () => {
  const files = ['server.js', 'app.js', 'services/streamService.js'];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    // Check for common credential patterns
    const patterns = [
      /password\s*=\s*['"][^'"]+['"]/i,
      /secret\s*=\s*['"][^'"]+['"]/i,
      /token\s*=\s*['"][A-Za-z0-9]{20,}['"]/
    ];
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        throw new Error(`Potential hardcoded credential in ${file}`);
      }
    }
  }
});

test('Authentication middleware blocks sensitive paths', () => {
  const authContent = fs.readFileSync('middleware/auth.js', 'utf8');
  if (!authContent.includes('/__debug')) {
    throw new Error('Debug endpoints not protected');
  }
});

test('Protected pages require admin authentication', () => {
  const authContent = fs.readFileSync('middleware/auth.js', 'utf8');
  if (!authContent.includes('protectedPages')) {
    throw new Error('Protected pages not configured');
  }
  if (!authContent.includes('/universal-streamer')) {
    throw new Error('Universal streamer not protected');
  }
});

// ===== SECTION 2: File System Security =====
console.log('\n📁 SECTION 2: File System & Path Security\n');

test('Path traversal protection implemented', () => {
  const staticServing = fs.readFileSync('middleware/staticServing.js', 'utf8');
  if (!staticServing.includes('path.resolve') && !staticServing.includes('startsWith')) {
    throw new Error('No path traversal protection');
  }
});

test('Sensitive directories blocked', () => {
  const staticServing = fs.readFileSync('middleware/staticServing.js', 'utf8');
  const blockedDirs = ['/cookies', '/logs', '/uploads', '/.git'];
  for (const dir of blockedDirs) {
    if (!staticServing.includes(dir)) {
      throw new Error(`Directory ${dir} not blocked`);
    }
  }
});

test('Sensitive file extensions blocked', () => {
  const staticServing = fs.readFileSync('middleware/staticServing.js', 'utf8');
  const blockedExts = ['.env', '.js', '.json', '.log', '.txt'];
  for (const ext of blockedExts) {
    if (!staticServing.includes(ext)) {
      throw new Error(`Extension ${ext} not blocked`);
    }
  }
});

test('Stream name validation prevents directory traversal', () => {
  const telegramBot = fs.readFileSync('services/telegramBot.js', 'utf8');
  if (!telegramBot.includes('/^[a-zA-Z0-9_-]+$/')) {
    throw new Error('Stream name validation missing or weak');
  }
});

// ===== SECTION 3: Process Management =====
console.log('\n⚙️  SECTION 3: Process Management & Cleanup\n');

test('Graceful shutdown handlers registered', () => {
  const server = fs.readFileSync('server.js', 'utf8');
  if (!server.includes('setupGracefulShutdown()')) {
    throw new Error('Graceful shutdown not set up');
  }
});

test('FFmpeg processes killed on shutdown', () => {
  const streamService = fs.readFileSync('services/streamService.js', 'utf8');
  if (!streamService.includes('process.kill(-ent.pid')) {
    throw new Error('Process group killing not implemented');
  }
});

test('Telegram bot stopped during shutdown', () => {
  const streamService = fs.readFileSync('services/streamService.js', 'utf8');
  if (!streamService.includes('telegramBot.stop()')) {
    throw new Error('Telegram bot not stopped on shutdown');
  }
});

test('Force kill mechanism for orphaned processes', () => {
  const streamService = fs.readFileSync('services/streamService.js', 'utf8');
  if (!streamService.includes('SIGKILL')) {
    throw new Error('No force kill mechanism');
  }
});

// ===== SECTION 4: API Security =====
console.log('\n🔐 SECTION 4: API Security\n');

test('Write operations require admin authentication', () => {
  const auth = fs.readFileSync('middleware/auth.js', 'utf8');
  if (!auth.includes('app.post("/api/*"') || !auth.includes('authMiddleware')) {
    throw new Error('POST routes not protected');
  }
  if (!auth.includes('app.delete("/api/*"') || !auth.includes('authMiddleware')) {
    throw new Error('DELETE routes not protected');
  }
});

test('Read operations accessible without auth', () => {
  const auth = fs.readFileSync('middleware/auth.js', 'utf8');
  if (!auth.includes('app.get("/api/*"')) {
    throw new Error('GET routes configuration missing');
  }
});

test('Upload endpoint requires admin auth', () => {
  const auth = fs.readFileSync('middleware/auth.js', 'utf8');
  if (!auth.includes('app.post("/api/upload", authMiddleware, requireAdmin)')) {
    throw new Error('Upload endpoint not properly protected');
  }
});

// ===== SECTION 5: Telegram Bot Security =====
console.log('\n🤖 SECTION 5: Telegram Bot Security\n');

test('Telegram bot validates admin users', () => {
  const bot = fs.readFileSync('services/telegramBot.js', 'utf8');
  if (!bot.includes('isAdmin(userId)')) {
    throw new Error('Admin validation missing');
  }
});

test('Bot rejects unauthorized users', () => {
  const bot = fs.readFileSync('services/telegramBot.js', 'utf8');
  if (!bot.includes('Access denied')) {
    throw new Error('No access denied message');
  }
});

test('File type validation for uploads', () => {
  const bot = fs.readFileSync('services/telegramBot.js', 'utf8');
  if (!bot.includes('mime_type')) {
    throw new Error('No MIME type validation');
  }
});

test('Stream URL uses display URL from env', () => {
  const bot = fs.readFileSync('services/telegramBot.js', 'utf8');
  if (!bot.includes('TELEGRAM_STREAM_DISPLAY_URL')) {
    throw new Error('Display URL not configured');
  }
});

// ===== SECTION 6: Data Protection =====
console.log('\n🛡️  SECTION 6: Data Protection & Privacy\n');

test('Metadata stores protected paths', () => {
  const streamService = fs.readFileSync('services/streamService.js', 'utf8');
  // Check that filePath is stored as '[protected]' in some cases
  if (streamService.includes("filePath: '[protected]'")) {
    return true;
  }
  return 'Consider using protected paths in metadata';
});

test('No sensitive data in console logs', () => {
  const files = ['services/telegramBot.js', 'services/streamService.js'];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    // Check for full token logging
    if (content.match(/console\.log.*token[^}]*substring/)) {
      // Good - using substring
      continue;
    }
    if (content.match(/console\.log.*TELEGRAM_BOT_TOKEN[^}]*=/)) {
      throw new Error(`Full token might be logged in ${file}`);
    }
  }
});

test('Cookies directory secured', () => {
  const staticServing = fs.readFileSync('middleware/staticServing.js', 'utf8');
  if (!staticServing.includes('/cookies')) {
    throw new Error('Cookies directory not blocked');
  }
});

// ===== SECTION 7: Input Validation =====
console.log('\n✏️  SECTION 7: Input Validation\n');

test('Stream names sanitized', () => {
  const upload = fs.readFileSync('routes/upload.js', 'utf8');
  if (!upload.includes('replace') || !upload.includes('[^a-z0-9')) {
    throw new Error('Stream name sanitization missing');
  }
});

test('URL validation for YouTube streams', () => {
  const streams = fs.readFileSync('routes/streams.js', 'utf8');
  if (!streams.includes('new URL(url)')) {
    throw new Error('URL validation missing');
  }
});

test('File existence checks before processing', () => {
  const streamService = fs.readFileSync('services/streamService.js', 'utf8');
  if (!streamService.includes('fs.existsSync(filePath)')) {
    throw new Error('No file existence validation');
  }
});

// ===== SECTION 8: Error Handling =====
console.log('\n⚠️  SECTION 8: Error Handling & Information Leakage\n');

test('Generic error messages to clients', () => {
  const auth = fs.readFileSync('middleware/auth.js', 'utf8');
  if (auth.includes('Invalid username or password')) {
    // Good - doesn't specify which one is wrong
    return true;
  }
  throw new Error('Error messages might leak information');
});

test('FFmpeg errors handled gracefully', () => {
  const streamService = fs.readFileSync('services/streamService.js', 'utf8');
  if (!streamService.includes('ffmpegProcess.on(\'error\'')) {
    throw new Error('FFmpeg error handling missing');
  }
});

test('Telegram bot error handling', () => {
  const bot = fs.readFileSync('services/telegramBot.js', 'utf8');
  if (!bot.includes('this.bot.catch')) {
    throw new Error('Telegram bot error handler missing');
  }
});

// ===== Summary =====
console.log('\n' + '='.repeat(70));
console.log('📊 SECURITY AUDIT SUMMARY');
console.log('='.repeat(70));
console.log(`\n✅ Passed:     ${passed}`);
console.log(`❌ Failed:     ${failed}`);
console.log(`⚠️  Warnings:   ${warnings}`);
console.log(`📈 Total:      ${passed + failed + warnings}`);

const score = ((passed / (passed + failed + warnings)) * 100).toFixed(1);
console.log(`\n🎯 Security Score: ${score}%`);

if (failed === 0 && warnings === 0) {
  console.log('\n🎉 EXCELLENT! No security issues found.');
} else if (failed === 0) {
  console.log('\n✓ Good security posture with minor recommendations.');
} else {
  console.log('\n⚠️  CRITICAL: Security vulnerabilities detected! Please review failed tests.');
}

console.log('\n' + '='.repeat(70) + '\n');

process.exit(failed > 0 ? 1 : 0);

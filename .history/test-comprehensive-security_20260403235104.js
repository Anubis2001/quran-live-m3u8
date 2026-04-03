/**
 * Comprehensive Security Testing Suite
 * Tests authentication system for common vulnerabilities and security issues
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:8300';
let authToken = null;
let adminToken = null;

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function addResult(test, passed, message) {
  results.tests.push({ test, passed, message });
  if (passed) {
    results.passed++;
    log(`✓ PASS: ${test}`, 'green');
  } else {
    results.failed++;
    log(`✗ FAIL: ${test}`, 'red');
    log(`  Details: ${message}`, 'yellow');
  }
}

function addWarning(test, message) {
  results.warnings++;
  results.tests.push({ test, passed: null, message });
  log(`⚠ WARNING: ${test}`, 'yellow');
  log(`  Details: ${message}`, 'yellow');
}

// Helper function to make HTTP requests
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
            rawBody: data
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: null,
            rawBody: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// ========================================
// TEST SUITE 1: Authentication Security
// ========================================
async function testAuthenticationSecurity() {
  log('\n📋 TEST SUITE 1: Authentication Security', 'cyan');
  log('=' .repeat(60), 'cyan');

  // Test 1.1: Invalid credentials should be rejected
  try {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'invalid', password: 'wrongpass' }
    });
    
    addResult(
      'Invalid credentials rejection',
      res.statusCode === 401 && !res.body.success,
      `Expected 401, got ${res.statusCode}`
    );
  } catch (err) {
    addResult('Invalid credentials rejection', false, err.message);
  }

  // Test 1.2: Valid credentials should return token
  try {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'admin', password: '@!JKF3eWd12' }
    });
    
    if (res.body && res.body.success && res.body.token) {
      adminToken = res.body.token;
      addResult('Valid admin login', true, 'Admin token received');
    } else {
      addResult('Valid admin login', false, 'No token in response');
    }
  } catch (err) {
    addResult('Valid admin login', false, err.message);
  }

  // Test 1.3: Token should be required for protected routes
  try {
    const res = await makeRequest('/api/users', {
      method: 'GET'
    });
    
    addResult(
      'Token required for admin routes',
      res.statusCode === 401,
      `Expected 401, got ${res.statusCode}`
    );
  } catch (err) {
    addResult('Token required for admin routes', false, err.message);
  }

  // Test 1.4: Invalid token should be rejected
  try {
    const res = await makeRequest('/api/users', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalidtoken123' }
    });
    
    addResult(
      'Invalid token rejection',
      res.statusCode === 401,
      `Expected 401, got ${res.statusCode}`
    );
  } catch (err) {
    addResult('Invalid token rejection', false, err.message);
  }
}

// ========================================
// TEST SUITE 2: Input Validation & Sanitization
// ========================================
async function testInputValidation() {
  log('\n📋 TEST SUITE 2: Input Validation & Sanitization', 'cyan');
  log('=' .repeat(60), 'cyan');

  // Test 2.1: SQL Injection attempt in login
  try {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: "' OR '1'='1", password: "password' OR '1'='1" }
    });
    
    addResult(
      'SQL injection prevention in login',
      res.statusCode === 401 || res.statusCode === 400,
      `SQL injection attempt not blocked (status: ${res.statusCode})`
    );
  } catch (err) {
    addResult('SQL injection prevention in login', false, err.message);
  }

  // Test 2.2: XSS attempt in registration
  try {
    const res = await makeRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { 
        username: '<script>alert("xss")</script>',
        password: 'TestPass123'
      }
    });
    
    addResult(
      'XSS prevention in registration',
      res.statusCode === 400 || !res.body.username?.includes('<script>'),
      'XSS attempt not properly sanitized'
    );
  } catch (err) {
    addResult('XSS prevention in registration', false, err.message);
  }

  // Test 2.3: Path traversal attempt
  try {
    const res = await makeRequest('/streams/../../../etc/passwd', {
      method: 'GET'
    });
    
    addResult(
      'Path traversal prevention',
      res.statusCode === 403 || res.statusCode === 404,
      `Path traversal not blocked (status: ${res.statusCode})`
    );
  } catch (err) {
    addResult('Path traversal prevention', false, err.message);
  }
}

// ========================================
// TEST SUITE 3: Rate Limiting
// ========================================
async function testRateLimiting() {
  log('\n📋 TEST SUITE 3: Rate Limiting', 'cyan');
  log('=' .repeat(60), 'cyan');

  // Test 3.1: Multiple failed login attempts
  const attempts = [];
  for (let i = 0; i < 15; i++) {
    try {
      const res = await makeRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { username: 'invalid', password: 'wrong' }
      });
      attempts.push(res.statusCode);
    } catch (err) {
      // Ignore errors
    }
  }
  
  const rateLimited = attempts.some(code => code === 429);
  addResult(
    'Rate limiting on login endpoint',
    rateLimited,
    `Rate limiting not detected after ${attempts.length} attempts`
  );
}

// ========================================
// TEST SUITE 4: Session Security
// ========================================
async function testSessionSecurity() {
  log('\n📋 TEST SUITE 4: Session Security', 'cyan');
  log('=' .repeat(60), 'cyan');

  // Test 4.1: Logout should invalidate token
  if (adminToken) {
    try {
      await makeRequest('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      // Try to use the token again
      const res = await makeRequest('/api/users', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      addResult(
        'Token invalidation on logout',
        res.statusCode === 401,
        'Token still valid after logout'
      );
      
      // Re-login for further tests
      const loginRes = await makeRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { username: 'admin', password: '@!JKF3eWd12' }
      });
      
      if (loginRes.body && loginRes.body.token) {
        adminToken = loginRes.body.token;
      }
    } catch (err) {
      addResult('Token invalidation on logout', false, err.message);
    }
  }

  // Test 4.2: Session fixation prevention
  try {
    const res1 = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'admin', password: '@!JKF3eWd12' }
    });
    
    const res2 = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'admin', password: '@!JKF3eWd12' }
    });
    
    const differentTokens = res1.body.token !== res2.body.token;
    addResult(
      'Session fixation prevention',
      differentTokens,
      'Same token issued on multiple logins'
    );
  } catch (err) {
    addResult('Session fixation prevention', false, err.message);
  }
}

// ========================================
// TEST SUITE 5: Authorization & RBAC
// ========================================
async function testAuthorization() {
  log('\n📋 TEST SUITE 5: Authorization & RBAC', 'cyan');
  log('=' .repeat(60), 'cyan');

  // Create a regular user for testing
  let userToken = null;
  try {
    const registerRes = await makeRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'testuser', password: 'TestPass123', email: 'test@example.com' }
    });
    
    if (registerRes.body.success) {
      const loginRes = await makeRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { username: 'testuser', password: 'TestPass123' }
      });
      
      if (loginRes.body.token) {
        userToken = loginRes.body.token;
        addResult('Test user creation', true, 'User created successfully');
      }
    }
  } catch (err) {
    addResult('Test user creation', false, err.message);
  }

  // Test 5.1: Regular user cannot access admin endpoints
  if (userToken) {
    try {
      const res = await makeRequest('/api/users', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      
      addResult(
        'User cannot access admin endpoints',
        res.statusCode === 403,
        `Expected 403, got ${res.statusCode}`
      );
    } catch (err) {
      addResult('User cannot access admin endpoints', false, err.message);
    }
  }

  // Test 5.2: Admin can access admin endpoints
  if (adminToken) {
    try {
      const res = await makeRequest('/api/users', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      addResult(
        'Admin can access admin endpoints',
        res.statusCode === 200,
        `Expected 200, got ${res.statusCode}`
      );
    } catch (err) {
      addResult('Admin can access admin endpoints', false, err.message);
    }
  }
}

// ========================================
// TEST SUITE 6: Security Headers
// ========================================
async function testSecurityHeaders() {
  log('\n📋 TEST SUITE 6: Security Headers', 'cyan');
  log('=' .repeat(60), 'cyan');

  try {
    const res = await makeRequest('/', { method: 'GET' });
    
    // Check for security headers
    const headers = res.headers;
    
    addResult(
      'X-Content-Type-Options header',
      headers['x-content-type-options'] === 'nosniff',
      'Header missing or incorrect'
    );
    
    addResult(
      'X-Frame-Options header',
      headers['x-frame-options'] === 'DENY' || headers['x-frame-options'] === 'SAMEORIGIN',
      'Header missing or incorrect'
    );
    
    addResult(
      'Strict-Transport-Security header',
      !!headers['strict-transport-security'],
      'Header missing (should be present in production)'
    );
    
    addResult(
      'X-XSS-Protection header',
      !!headers['x-xss-protection'],
      'Header missing'
    );
  } catch (err) {
    addResult('Security headers check', false, err.message);
  }
}

// ========================================
// MAIN EXECUTION
// ========================================
async function runAllTests() {
  log('\n🔐 COMPREHENSIVE SECURITY TEST SUITE', 'magenta');
  log('=' .repeat(60), 'magenta');
  log('Starting security assessment...', 'blue');
  
  const startTime = Date.now();
  
  try {
    await testAuthenticationSecurity();
    await testInputValidation();
    await testRateLimiting();
    await testSessionSecurity();
    await testAuthorization();
    await testSecurityHeaders();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Print summary
    log('\n' + '=' .repeat(60), 'cyan');
    log('📊 TEST SUMMARY', 'cyan');
    log('=' .repeat(60), 'cyan');
    log(`Total Tests: ${results.tests.length}`, 'blue');
    log(`✓ Passed: ${results.passed}`, 'green');
    log(`✗ Failed: ${results.failed}`, 'red');
    log(`⚠ Warnings: ${results.warnings}`, 'yellow');
    log(`Duration: ${duration}s`, 'blue');
    log('=' .repeat(60), 'cyan');
    
    if (results.failed === 0) {
      log('\n✅ ALL CRITICAL TESTS PASSED!', 'green');
      log('Your authentication system is secure against common vulnerabilities.', 'green');
    } else {
      log(`\n❌ ${results.failed} CRITICAL ISSUES FOUND!`, 'red');
      log('Please review and fix the failed tests above.', 'red');
    }
    
    if (results.warnings > 0) {
      log(`\n⚠️  ${results.warnings} warnings should be reviewed.`, 'yellow');
    }
    
    // Exit with error code if any tests failed
    process.exit(results.failed > 0 ? 1 : 0);
    
  } catch (err) {
    log(`\n❌ Test suite error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch(err => {
  log(`\n❌ Fatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});

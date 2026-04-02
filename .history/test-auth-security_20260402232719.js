/**
 * Test script to verify authentication security
 * Tests that incorrect passwords are properly rejected
 */

const http = require('http');

const PORT = 8300;
const BASE_URL = `http://localhost:${PORT}`;

// Test credentials
const TEST_CASES = [
  {
    name: 'Admin with correct password',
    username: 'admin',
    password: '@!JKF3eWd12',
    shouldSucceed: true
  },
  {
    name: 'Admin with wrong password',
    username: 'admin',
    password: 'wrongpassword',
    shouldSucceed: false
  },
  {
    name: 'User with correct password',
    username: 'user',
    password: 'user123',
    shouldSucceed: false // User role should be rejected for admin endpoints
  },
  {
    name: 'User with wrong password',
    username: 'user',
    password: 'wrongpassword',
    shouldSucceed: false
  },
  {
    name: 'Non-existent user',
    username: 'hacker',
    password: 'hack123',
    shouldSucceed: false
  }
];

function makeRequest(username, password) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/streams',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data,
          headers: res.headers
        });
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({}));
    req.end();
  });
}

async function runTests() {
  console.log('🔐 Testing Authentication Security\n');
  console.log('=' .repeat(50));
  
  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    try {
      const result = await makeRequest(testCase.username, testCase.password);
      
      const isAuthorized = result.statusCode === 200 || result.statusCode === 201;
      const isRejected = result.statusCode === 401 || result.statusCode === 403;
      
      const success = testCase.shouldSucceed ? isAuthorized : isRejected;
      
      console.log(`\nTest: ${testCase.name}`);
      console.log(`  Expected: ${testCase.shouldSucceed ? 'Authorized' : 'Rejected'}`);
      console.log(`  Actual: ${isAuthorized ? 'Authorized' : 'Rejected'} (${result.statusCode})`);
      console.log(`  Result: ${success ? '✅ PASS' : '❌ FAIL'}`);
      
      if (success) {
        passed++;
      } else {
        failed++;
        console.log(`  Response: ${result.body.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`\nTest: ${testCase.name}`);
      console.log(`  ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n✅ All authentication tests passed!');
    console.log('Security vulnerability has been fixed.');
  } else {
    console.log('\n❌ Some tests failed. Authentication may still have issues.');
  }
}

// Run tests
runTests().catch(console.error);

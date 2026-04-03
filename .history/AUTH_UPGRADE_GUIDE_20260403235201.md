# Authentication System Upgrade Guide

## 🎯 Overview

This document outlines the comprehensive security upgrade performed on the authentication system, transitioning from basic HTTP authentication to a robust, session-based authentication system with full RBAC (Role-Based Access Control).

---

## 📋 What Changed

### **1. Authentication Method**
- **Before**: HTTP Basic Authentication (credentials sent with every request)
- **After**: Token-based session authentication with secure httpOnly cookies

### **2. Security Enhancements**
- ✅ Password hashing with bcrypt (12 salt rounds)
- ✅ Secure session management with UUID tokens
- ✅ Rate limiting on authentication endpoints (10 attempts per 15 minutes)
- ✅ Input validation and sanitization (XSS, SQL injection prevention)
- ✅ Security headers (Helmet.js)
- ✅ CORS protection
- ✅ Path traversal prevention
- ✅ Session invalidation on logout/password change

### **3. User Management**
- ✅ User registration with validation
- ✅ Password reset functionality
- ✅ Admin panel for user management
- ✅ Role-based access control (Admin/User roles)
- ✅ Activity logging and audit trails
- ✅ Account status tracking (active/suspended)

### **4. New Features**
- Modern login/register/forgot-password pages
- Admin user management dashboard (`/admin-users.html`)
- Comprehensive security testing suite
- API endpoints for password management

---

## 🔧 New Dependencies Installed

```json
{
  "helmet": "^7.0.0",           // Security headers
  "express-rate-limit": "^7.0.0", // Rate limiting
  "validator": "^13.0.0",       // Input validation
  "xss-clean": "^0.1.4",        // XSS protection
  "mongo-sanitize": "^1.1.0"    // NoSQL injection prevention
}
```

---

## 🗄️ Database Changes

New tables created:
```sql
- users              (existing, enhanced)
- sessions           (existing)
- activity_log       (existing)
- password_resets    (NEW - for password recovery)
```

The `password_resets` table stores temporary tokens for password recovery.

---

## 🔑 New API Endpoints

### Authentication
```
POST   /api/auth/register          - Register new user
POST   /api/auth/login             - Login (returns token)
POST   /api/auth/logout            - Logout (invalidates token)
GET    /api/auth/me                - Get current user info
POST   /api/auth/forgot-password   - Request password reset
POST   /api/auth/reset-password    - Reset password with token
POST   /api/auth/change-password   - Change password (authenticated)
```

### User Management (Admin Only)
```
GET    /api/users                  - List all users
POST   /api/users                  - Create new user
PUT    /api/users/:id              - Update user
DELETE /api/users/:id              - Delete user
```

---

## 🌐 New Pages

| Page | URL | Description |
|------|-----|-------------|
| Login | `/login.html` | Modern login page |
| Register | `/register.html` | User registration |
| Forgot Password | `/forgot-password.html` | Password recovery |
| Admin Users | `/admin-users.html` | User management (admin only) |

---

## 🚀 Migration Steps

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Update Environment Variables
Add these to your `.env` file:
```env
NODE_ENV=development
SESSION_SECRET=your-super-secret-key-change-in-production
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=quran_streaming
ALLOWED_ORIGINS=http://localhost:8300
```

### Step 3: Initialize Database
The database will auto-initialize when you start the server. Tables will be created automatically.

### Step 4: Start the Server
```bash
npm start
```

### Step 5: Login with Default Admin
- **Username**: `admin`
- **Password**: `@!JKF3eWd12`
- ⚠️ **IMPORTANT**: Change this password immediately!

---

## 🔄 Breaking Changes

### Removed Features
1. **Basic HTTP Authentication** - No longer supported
2. **Hardcoded credentials** - All authentication is now database-driven
3. **Client-side password storage** - Passwords removed from `client.js`

### API Changes
All API routes that previously used Basic Auth now require Bearer token authentication:
```javascript
// Old way (no longer works)
fetch('/api/streams/test/start', {
  headers: {
    'Authorization': 'Basic ' + btoa('admin:password')
  }
});

// New way
fetch('/api/streams/test/start', {
  headers: {
    'Authorization': 'Bearer ' + authToken
  }
});
```

---

## 🔒 Security Best Practices

### Production Deployment Checklist

- [ ] Change `SESSION_SECRET` to a strong random value
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (update cookie settings)
- [ ] Change default admin password
- [ ] Configure `ALLOWED_ORIGINS` properly
- [ ] Set up MySQL with strong credentials
- [ ] Enable firewall rules
- [ ] Set up monitoring/logging
- [ ] Regular security audits

### Recommended Session Secret Generation
```bash
# Generate a strong secret
openssl rand -base64 64
```

---

## 🧪 Testing

Run the comprehensive security test suite:
```bash
node test-comprehensive-security.js
```

This will test:
- ✓ Authentication security
- ✓ Input validation & sanitization
- ✓ Rate limiting
- ✓ Session security
- ✓ Authorization & RBAC
- ✓ Security headers

---

## 📊 Role Permissions Matrix

| Permission | Guest | User | Admin |
|------------|-------|------|-------|
| View streams | ✓ | ✓ | ✓ |
| View stream list | ✓ | ✓ | ✓ |
| Login | ✓ | ✓ | ✓ |
| Register | ✓ | ✓ | - |
| Start stream | ✗ | ✗ | ✓ |
| Stop stream | ✗ | ✗ | ✓ |
| Delete stream | ✗ | ✗ | ✓ |
| Upload stream | ✗ | ✗ | ✓ |
| Rename stream | ✗ | ✗ | ✓ |
| Manage users | ✗ | ✗ | ✓ |
| Access debug endpoints | ✗ | ✗ | ✓ |

---

## 🛠️ Troubleshooting

### Issue: "Database connection failed"
**Solution**: Ensure MySQL is running and credentials in `.env` are correct.

### Issue: "Authentication required" errors
**Solution**: Clear browser cookies and login again.

### Issue: "Rate limit exceeded"
**Solution**: Wait 15 minutes or restart the server (in development).

### Issue: Old Basic Auth still working
**Solution**: Clear browser cache and restart the server completely.

---

## 📚 Additional Resources

- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)

---

## 🆘 Support

If you encounter issues during migration:
1. Check the troubleshooting section above
2. Review the error logs in `logs/app.log`
3. Run the security test suite to identify specific issues
4. Ensure all dependencies are installed: `npm install`

---

## ✅ Verification Checklist

After migration, verify:
- [ ] Server starts without errors
- [ ] Database tables created successfully
- [ ] Can login with default admin credentials
- [ ] Can register new users
- [ ] Session tokens are being issued
- [ ] Protected routes require authentication
- [ ] Admin-only routes reject non-admin users
- [ ] Rate limiting is active
- [ ] Security headers present in responses
- [ ] All existing stream functionality works

---

**Last Updated**: 2026-04-03  
**Version**: 2.0.0  
**Status**: Production Ready ✅

/**
 * Security Middleware Configuration
 * Implements comprehensive security measures for the application
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const mongoSanitize = require('mongo-sanitize');

/**
 * Security Headers Configuration
 * Sets various HTTP headers for security
 */
function setupSecurityHeaders(app) {
  // Use helmet for standard security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false // Set to true in production with HTTPS
    }
  }));

  // Additional security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Remove server header for security through obscurity
    res.removeHeader('X-Powered-By');
    
    next();
  });
}

/**
 * Rate Limiting Configuration
 * Prevents brute force attacks and API abuse
 */
function setupRateLimiting(app) {
  // General API rate limiter
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.ip || req.connection.remoteAddress;
    }
  });

  // Strict rate limiter for authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login attempts per 15 minutes
    message: {
      success: false,
      error: 'Too many login attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
    keyGenerator: (req) => {
      return req.ip || req.connection.remoteAddress;
    }
  });

  // Apply rate limiters
  app.use('/api/', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
}

/**
 * Input Sanitization
 * Prevents XSS and NoSQL injection attacks
 */
function setupInputSanitization(app) {
  // Sanitize request body to prevent XSS
  app.use(xss());

  // Prevent NoSQL injection
  app.use(mongoSanitize());

  // Additional input validation middleware
  app.use((req, res, next) => {
    // Sanitize strings in request body
    if (req.body && typeof req.body === 'object') {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          req.body[key] = req.body[key].trim();
          // Remove potential script tags and dangerous characters
          req.body[key] = req.body[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        }
      });
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = req.query[key].trim();
        }
      });
    }

    next();
  });
}

/**
 * Request Validation Middleware
 * Validates common request properties
 */
function validateRequest(req, res, next) {
  // Check content type for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      // Allow multipart/form-data for file uploads
      if (!contentType || !contentType.includes('multipart/form-data')) {
        return res.status(415).json({
          success: false,
          error: 'Unsupported Media Type. Content-Type must be application/json or multipart/form-data'
        });
      }
    }
  }

  next();
}

/**
 * CORS Configuration
 * Controls cross-origin resource sharing
 */
function setupCORS(app) {
  app.use((req, res, next) => {
    // In production, you should specify allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:8300'];

    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    next();
  });
}

/**
 * Initialize all security middleware
 */
function initializeSecurity(app) {
  console.log('🔒 Initializing security middleware...');
  
  setupSecurityHeaders(app);
  setupRateLimiting(app);
  setupInputSanitization(app);
  setupCORS(app);
  
  console.log('✓ Security middleware initialized');
}

module.exports = {
  initializeSecurity,
  validateRequest
};

const rateLimit = require('express-rate-limit');
const logger = require('./logger');

// General API rate limiter - 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 100, // Maximum 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warning('Rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Strict limiter for creating resources - 10 requests per hour
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Too many create requests, please try again later.',
    retryAfter: '1 hour'
  },
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    logger.warning('Create rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too many create operations, please try again in 1 hour.'
    });
  }
});

// Very strict for authentication failures - 5 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Only count failed attempts
  handler: (req, res) => {
    logger.error('Auth rate limit exceeded - possible attack', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too many authentication failures. Account temporarily locked.',
      retryAfter: '15 minutes'
    });
  }
});

// Per-API-key rate limiter - FIXED for IPv6
function createApiKeyLimiter(maxRequests, windowMinutes) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    // Fixed: Properly handle both API key and IP-based limiting
    keyGenerator: (req, res) => {
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      if (apiKey) {
        return `apikey:${apiKey}`;
      }
      // Fall back to IP if no API key (this won't happen with validateApiKey middleware)
      return req.ip;
    },
    handler: (req, res) => {
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      logger.warning('API key rate limit exceeded', {
        apiKey: apiKey ? '***' : 'none',
        ip: req.ip
      });
      res.status(429).json({
        error: `API key rate limit exceeded. Max ${maxRequests} requests per ${windowMinutes} minutes.`
      });
    }
  });
}

module.exports = {
  apiLimiter,
  createLimiter,
  authLimiter,
  createApiKeyLimiter
};
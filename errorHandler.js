// Custom error classes
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message) {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message) {
    super(message, 403);
  }
}

// Global error handler middleware
function errorHandler(err, req, res, next) {
  let { statusCode, message } = err;

  // Default to 500 if no status code
  statusCode = statusCode || 500;
  message = message || 'Internal Server Error';

  // Log error details
  console.error('Error occurred:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    message,
    stack: err.stack
  });

  // Send response
  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      path: req.path,
      timestamp: new Date().toISOString()
    }
  });
}

// Async wrapper to catch errors in async route handlers
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  errorHandler,
  asyncHandler
};